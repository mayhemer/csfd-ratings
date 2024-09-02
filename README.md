# ÈSFD Firefox add-on - Grafický pøehled hodnocení u každého filmu / graphical overview of ratings for individual films

This add-on's purpose is to show a graph of overall ratings by the star count on film details pages on the www.csfd.cz web site.

```
***** [-----  ]
****  [-------]
***   [---    ]
**    [--     ]
*     [-      ]
trash [-      ]
```

Why?  I always missed this "distribution" kind of view to make a more profound assement of a film rating.  The percentage in itself was never enough.  For me the indicator was always to see how variable the rating was.  Most interesting films for me were always those whose ratings spread to all sides - from total trash to five stars: a.k.a controversial.  The percentage says mostly nothing about that.  So, I wrote this add-on to see it as a graph!

## Privacy

The extension doesn't track or send anywhere any private data.  It's sole purpose and function is to show the graphical summary of a single film rating, nothing else.

## Summary of the extension code

ÈSFD has no API to query the necessary data easily from.  Only way is to select data from the page HTML directly.  What the extension does is summation of star ratings from the small "Ratings" view at the right side - visible on a wider screen.  To see more of them, you need to click on the right arrow (>) bellow.  As there is always only 10 ratings on a page, the add-on internally fetches this "next page", extracts the relevant part of the HTML, adds to the graph, then queries for the next next page, and so on, up to thirty times.

The data is queried from the DOM using vanila JS `querySelector*()` methods.  The elements to look for are well distinguished by class name hierarchy.

To prevent excessive requests to www.csfd.cz the data, once completed, is cached using `localStorage` for each visited film page for a period of one week.  There is also a refresh button you can use to reload with the most recent data.
