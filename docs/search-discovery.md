# Multilingual search discovery

## Reference review

- Color Hunt publishes descriptive titles and summaries, canonical URLs, large social cards, and a sitemap advertised in its crawler file. Its pastel page gives that category a dedicated URL. [Color Hunt pastel palettes](https://colorhunt.co/palettes/pastel) · [Color Hunt crawler rules](https://colorhunt.co/robots.txt)
- Coolors gives its tools and galleries separate titles and summaries, includes a large social card, and lists its public URLs through a sitemap index. [Coolors palette gallery](https://coolors.co/palettes) · [Coolors sitemap index](https://coolors.co/sitemap.xml)

## Color Kitchen

English, French, Spanish, Portuguese, and German have their own titles, descriptions, and canonical URLs. Indexable pages link to themselves and their equivalent pages in the other four languages, with English as the default. Social preview tags and structured data use the same URL and localized copy. [Google’s localized page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions)

The Palette Gallery links to published mood collections and the Gradient Gallery links to published linear, radial, and conic collections. These pages have localized introductions and server-rendered links to the catalog. Keep new indexable collections focused on a defined topic with published results. Free-form search, filters, alternate sort orders, and cursor pages use `noindex`. [Google’s faceted navigation guidance](https://developers.google.com/crawling/docs/faceted-navigation)

`/sitemap.xml` lists the canonical public tools, galleries, collections, and current localized catalog releases. Withdrawing a release removes its URL on the next sitemap request. `/robots.txt` advertises the sitemap. `BreadcrumbList` markup follows the navigation shown on catalog details and curated collections. [Google’s sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) · [Google’s breadcrumb guidance](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)

## Production verification

Set `COLOR_KITCHEN_ORIGIN=https://www.color-kitchen.com` in production and use `COLOR_KITCHEN_INDEXING=false` on staging previews. The server uses the configured origin for canonical URLs, language alternates, crawler directives, and social images. Verify the deployed sitemap and a representative URL in each language before submitting the sitemap under the same verified origin in Search Console. [Environment configuration](environment-configuration.md) · [Google’s sitemap submission guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
