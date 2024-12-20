/**
 * Purpose of the extension
 *
 * Display distribution of film ratings on www.csfd.cz/film/ pages related
 * to the film title.  Show number of 5-stars, 4-stars, etc... ratings as
 * graphical/progress bars inside the page, above the individual ratings
 * section.
 *
 * Data sources
 *
 * csfd.cz has no API, so the extension parses/queries the HTML of the top
 * level `/film/.../` pages.  We look for the following elements:
 *
 * - <section class="others-rating"> element containing children
 *   <section class="stars stars-N"> where [N] is representing
 *   the rating level (star count).  The extension selects the number
 *   of these elements and cumulates the ratings in an array.
 *   => Ratings distribution array, [0..5] of integers
 *
 * - <a class="page-next">'s `href` value for the next page with more ratings
 *   until this elements has "disabled" class set; then we stop, it's the last
 *   page.
 *   => Next rating page URL; this URL is implicitly trusted to be from the
 *   https://www.csfd.cz origin
 *
 * Mechanism
 *
 * Initially, we look in the `document`.  Next page is fetch()'ed as text
 * (HTML), the "other-ratings" <section> is extracted out, a temporary element
 * is created and set `innerHTML` with the extracted HTML content.
 * This is potentially dangerous in case the next-page URL happens to be
 * maliciouly altered. Although, this temporary element is never inserted
 * to the page's document, we only use `querySelector*` methods on it to search
 * for data the same way as we initially look for it in the `document`.
 * Any malicious script injections should then not execute.
 *
 * The progress is updated at runtime with every sucessfull fetch().  The
 * maximum number of pages we load to collect ratings is 40 (hard coded).
 * We do at most 6 concurrent parallel requests.
 *
 * Caching
 *
 * To prevent excessive requests, the extension uses localStorage to cache
 * each `/film/.../` page ratings with expiration time of one week.
 * There is one items in localStorage per page visited.
 * The cache is checked before we start the load.  User is offered an action
 * to reload the data with a refresh button the extension adds to the page
 * when the distribution graph is populated from the cache.
 * The cache is pruned (semi-background and in a delayed fashion) of expired
 * entries on every visit of a `/film/.../` page.
 *
 * The cache key for `localStorage` items is built as:
 * `csfd-dist-rating-cache-${SHA1(film-permalink)}`, using SHA1 to prevent
 * leaking the history of visits just by looking at the cached keys.
 *
 * Content of a cache entry:
 * {
 *   "rating":[39,72,93,98,67,31],
 *   "timestamp":1725267704239
 * }
 * - `rating` is the Ratings distribution array
 * - `timestamps` is time of the cache entry creation, used for expiritaion
 *   calculation
 *
 * Privacy
 *
 * There is no user tracking, no external collection of any data.
 */

(async function() {
  const MAX_RATING_PAGES_TO_FETCH = 40;
  const PARALLEL_REQUESTS = 6;
  const CACHE_KEY_PREFIX = "csfd-dist-rating-cache-";
  const CACHE_TIME_TO_LIVE_MINUTES = 60 * 24 * 7; // keep each film cache for a week

  /**
   * @param {element} source - the DOM element to query children (data) for
   * @returns the string value of the 'href' for next ratings page, null on failure
   */
  const get_next_page_url = (source) => {
    const page_next = source.querySelector("a.page-next:not(.disabled)");
    return page_next?.getAttribute("href") || null;
  }
  /**
   * @param {href} the next rating page URL we want to change
   * @returns the rating page of the required number URL
   */
  const change_next_page_url = (href, page) => {
    return href.replace(/(\W)pageRating=\d+/, `$1pageRating=${page}`)
  }
  /**
   * @param {element} source - the DOM element to query children (data) for
   * @returns the string value of HTML content of the next-rating page, null on failure
   */
  const fetch_next_page_html = async (href) => {
    const url = new URL(href, window.origin);
    if (!url) {
      return null;
    }
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    return { html, href };
  };
  /**
   * @param {string} html - the fetched next-rating page HTML content
   * @returns a <body> DOM element set <section class="others-rating">...</section> content
   * from the provided html content
   */
  const get_other_rating_element_from_html = (html) => {
    const pattern = /(<section class="others\-rating">.*?<\/section>)/sg;
    const section = html.match(pattern);
    if (!section) {
      return null;
    }
    const e = document.createElement("body");
    e.innerHTML = section;
    return e;
  };

  /**
   * Expected selectors for each level of rating
   */
  const RATINGS_SELECTORS = [
    ".stars.trash",
    ".stars.stars-1",
    ".stars.stars-2",
    ".stars.stars-3",
    ".stars.stars-4",
    ".stars.stars-5"
  ];
  /**
   * Updates the cumulated ratings with newly provided DOM data.
   * @param {element} source - the DOM element we query elements (data) for
   * @param {object} rating - the reference to the global distribution array
   */
  const sink = (source, rating) => {
    for (let i in RATINGS_SELECTORS) {
      const sel = RATINGS_SELECTORS[i];
      const elements = source.querySelectorAll(`section.others-rating ${sel}`);
      rating[i] += elements?.length || 0;
    }
  };
  /**
   * Updates the progress bars after the data has been changed.
   * @param {object} rating - the reference to the global distribution array, immutable
   * @param {array} targets - the target UI DOM elements array, the progress bars
   * @param {int} iteration - the number of itteration, for global progress
   */
  const update_ui = (rating, targets, iteration = 0) => {
    let total = 0;
    for (let i in rating) {
      total = Math.max(total, rating[i]);
    }
    for (let i in rating) {
      const count = rating[i];
      const progress = targets[RATINGS_SELECTORS[i]];
      progress.setAttribute("max", Math.round(total + iteration));
      progress.setAttribute("value", count);
      progress.setAttribute("title", count + "x");
    }
  }

  /**
   * Loads data from localStorage, check for expiration, populates the distribution array with data
   * @param {string} key - the final cache key to load
   * @param {object} destination - the reference to the distribution array to fill
   * @returns true if the cache was loaded succesfully, false otherwise (expired, missing, invalid)
   */
  const read_cache = (key, destination) => {
    const json = key ? localStorage[key] : null;
    if (!json) {
      return false;
    }
    try {
      const data = JSON.parse(json);
      const { timestamp, rating } = data;
      const expiration = parseInt(timestamp) + 1000 * 60 * CACHE_TIME_TO_LIVE_MINUTES;
      if (Date.now() > expiration || !rating) {
        return false;
      }
      // Don't assign directly for security reasons
      // This is sanitization of user input
      for (let i in destination) {
        destination[i] = parseInt(rating[i]);
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  /**
   * Stores to localStorage the collected ratings data, adds timestamp=now for expiration calculations
   * @param {string} key - the final cache key to write to
   * @param {object} rating - the distribution array
   */
  const write_cache = (key, rating) => {
    if (!key) { return; }
    const data = {
      rating,
      timestamp: Date.now()
    }
    const json = JSON.stringify(data);
    localStorage[key] = json;
  }
  /**
   * Semi-background loop to check all cached entries for expiration and removing them.
   */
  const prune_cache = () => {
    const keys = [];
    const key_prefix = new RegExp(`^${CACHE_KEY_PREFIX}`);
    for (let i = 0; i < localStorage.length; ++i) {
      const key = localStorage.key(i);
      if (key.match(key_prefix)) {
        keys.push(key);
      }
    }
    const process = (i) => {
      if (!i) { return; }
      --i;
      const key = keys[i];
      if (!read_cache(key, {})) {
        localStorage.removeItem(key);
      }
      setTimeout(() => process(i));
    };
    process(keys.length);
  }

  /**
   * An async method, that adds a reload button to the page.  Resolves when this
   * button is clicked.
   * @param {object} rating - the distribution array to be nullified on reload
   */
  const maybe_reload = async (rating) => {
    const before = document.querySelector("div.user-list.rating-users");
    const parent = before.parentNode;
    const distribution_element = parent.querySelector("section.csfd-ratings-addon");
    const reload = document.createElement("div");
    reload.className = "csfd-ratings-addon reload"
    reload.innerHTML = `&#x27f3;`;
    distribution_element.appendChild(reload);

    return new Promise(resolve => {
      reload.addEventListener('click', () => {
        reload.remove();
        rating.fill(0);
        resolve();
      });
    });
  };

  // Globals
  // Cumulated distribution ratings ([0..5] -> integer)
  const ratings_dist = [];
  // UI elemets, <progress>, to show the results visually, keys are RATINGS_SELECTORS
  const ratings_elements = {};

  // Creates the UI, prepares the distribution array elements
  const initialize = () => {
    const before = document.querySelector("div.user-list.rating-users");
    const parent = before.parentNode;

    parent.querySelector("section.csfd-ratings-addon")?.remove();

    const distribution_element = document.createElement("section");
    distribution_element.className = "csfd-ratings-addon";

    for (let i in RATINGS_SELECTORS) {
      ratings_dist[i] = 0;
    }
    for (let sel of RATINGS_SELECTORS.reverse()) {
      const container = document.createElement("div");
      container.className = "distribution-container csfd-rating-addon";

      const star_rating = document.createElement("span");
      star_rating.className = "star-rating csfd-rating-addon";
      container.appendChild(star_rating);

      const star_rating_value = document.createElement("span");
      star_rating_value.className = sel.replace(/\./g, " ").trim() + " csfd-rating-addon";
      star_rating.appendChild(star_rating_value);

      const progress = document.createElement("progress");
      progress.className = "csfd-rating-addon";
      progress.setAttribute("max", 0);
      progress.setAttribute("value", 0);
      container.appendChild(progress);

      distribution_element.appendChild(container);
      ratings_elements[sel] = progress;
    }

    parent.insertBefore(distribution_element, before);
  }

  // Entry point
  initialize();
  setTimeout(prune_cache, 1500);

  const baseline_url = window.location.href.match(/^https:\/\/www\.csfd\.cz\/film\/([\d\w\-\/]+)\/[\w\-]+\//);
  const cache_key_base_hash = baseline_url ? await digestMessage(baseline_url[1]) : null
  const cache_key = cache_key_base_hash ? `${CACHE_KEY_PREFIX}${cache_key_base_hash}` : null;
  if (read_cache(cache_key, ratings_dist)) {
    update_ui(ratings_dist, ratings_elements);
    await maybe_reload(ratings_dist);
  }

  let source = document.querySelector("section.others-rating");
  let i = MAX_RATING_PAGES_TO_FETCH;

  if (PARALLEL_REQUESTS > 0) {
    sink(source, ratings_dist);
    update_ui(ratings_dist, ratings_elements, i);

    const next_page_url_template = get_next_page_url(source);
    let requests = [];
    let sent = 1;

    while (i && next_page_url_template) {
      while (sent < MAX_RATING_PAGES_TO_FETCH && requests.length < PARALLEL_REQUESTS) {
        ++sent;
        const href = change_next_page_url(next_page_url_template, sent);
        requests.push({ href, request: fetch_next_page_html(href) });
      }

      try {
        const request = Promise.any(requests.map(req => req.request));
        if (!request) {
          break;
        }

        const { html, href } = await request;
        requests = requests.filter(req => req.href != href);
        source = get_other_rating_element_from_html(html);
        
        --i;
        sink(source, ratings_dist);
        update_ui(ratings_dist, ratings_elements, i);
        
        if (!get_next_page_url(source)) {
          sent = MAX_RATING_PAGES_TO_FETCH;
        }
      } catch (e) {
        break;
      }      
    }
    update_ui(ratings_dist, ratings_elements);
  } else {
    while (source) {
      --i;
      sink(source, ratings_dist);
      update_ui(ratings_dist, ratings_elements, i);

      if (i == 0) {
        break;
      }

      const href = get_next_page_url(source);
      const html = await fetch_next_page_html(href);
      if (!html) {
        update_ui(ratings_dist, ratings_elements);
        break;
      }
      source = get_other_rating_element_from_html(html);
    }
  }

  write_cache(cache_key, ratings_dist);
})();
