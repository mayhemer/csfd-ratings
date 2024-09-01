(async function() {
  const get_next_page_url = (source) => {
    const page_next = source.querySelector(".page-next:not(.disabled)");
    return page_next?.getAttribute("href") || null;
  }
  const fetch_next_page_html = async (source) => {
    const URL = get_next_page_url(source);
    if (!URL) {
      return null;
    }
    const response = await fetch(window.origin + URL);
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    return html;
  };
  const get_other_ratinng_element_from_html = (html) => {
    const pattern = /(<section class="others\-rating"\>.*?<\/section>)/sg;
    const section = html.match(pattern);
    if (!section) {
      return null;
    }
    const e = document.createElement("body");
    e.innerHTML = section;
    return e;
  };

  const ratings_selectors = [".stars.stars-5", ".stars.stars-4", ".stars.stars-3", ".stars.stars-2", ".stars.stars-1", ".stars.trash"];
  const sink = (source, dist) => {
    for (let sel of ratings_selectors) {
      const elements = source.querySelectorAll(`section.others-rating ${sel}`);
      dist[sel] += elements?.length || 0;
    }
  };
  const update_ui = (dist, target) => {
    let total = 0;
    for (let sel in dist) {
      total += dist[sel];
    }
    for (let sel in dist) {
      const rating = dist[sel];
      const progress = target[sel];
      progress.setAttribute("max", total);
      progress.setAttribute("value", rating);
      progress.setAttribute("title", rating + "x");
    }
  }

  // Globals
  const ratings_dist = {};
  const ratings_elements = {};

  const initialize_ui = () => {
    const before = document.querySelector("div.user-list.rating-users");
    const parent = before.parentNode;
    const distribution_element = document.createElement("section");
    distribution_element.className = "csfd-ratings-addon";
  
    for (let sel of ratings_selectors) {
      ratings_dist[sel] = 0;
  
      const line = document.createElement("div");
      line.className = "distribution-line csfd-rating-addon";
      
      const star_rating = document.createElement("span");
      star_rating.className = "star-rating csfd-rating-addon";
      line.appendChild(star_rating);
      
      const star_rating_value = document.createElement("span");
      star_rating_value.className = sel.replace(/\./g, " ") + " csfd-rating-addon";
      star_rating.appendChild(star_rating_value);
      
      const progress = document.createElement("progress");
      progress.className = "distribution-line csfd-rating-addon";
      progress.setAttribute("max", 0);
      line.appendChild(progress);
      
      distribution_element.appendChild(line);
      ratings_elements[sel] = progress;
    }
  
    parent.insertBefore(distribution_element, before);
  }

  // Main loop, read `i` more pages to load the distribution, starting with the initial page
  initialize_ui();

  let source = document;
  let i = 30;
  while (source) {
    sink(source, ratings_dist);
    update_ui(ratings_dist, ratings_elements);

    if (--i == 0) {
      break;
    }

    const html = await fetch_next_page_html(source);
    if (!html) {
      break;
    }
    source = get_other_ratinng_element_from_html(html);
  }
})();
