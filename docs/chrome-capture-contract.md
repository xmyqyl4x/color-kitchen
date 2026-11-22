# Chrome color capture and handoff

Capture eligibility requires an explicit gesture for the active tab, temporary permission and a normal HTTP or HTTPS page. Browser-internal pages, local files, the Chrome Web Store and pages outside the permitted schemes return a restricted-page result. Permission denial and the absence of a gesture have separate results. The popup and worker will supply the invocation context through the extension messaging boundary. [Chrome active-tab permissions](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

Captured colors are reported in sRGB. Style colors retain their alpha and report their original color space and gamut mapping. Deduplication compares the normalized numeric channels and alpha. Chrome's eyedropper returns an sRGB color when the user completes a pick. [Chrome EyeDropper API](https://developer.chrome.com/docs/capabilities/web-apis/eyedropper)

An explicit handoff accepts two through twelve selected colors. It opens a localized Palette Studio route on the configured HTTPS origin, with an HTTP loopback option for development. The existing Palette Studio share fragment contains the ordered swatches and the share-format version. The destination receives the fragment in the browser and opens the existing preview. Page text, titles, pixels, source URLs and browser history have no fields in the transfer.
