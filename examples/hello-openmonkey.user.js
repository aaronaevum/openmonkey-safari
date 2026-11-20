// ==UserScript==
// @name         Hello OpenMonkey
// @namespace    https://openmonkey.example
// @version      1.0.0
// @description  A minimal example userscript for OpenMonkey for Safari: adds a small banner to example.com and counts your visits.
// @author       OpenMonkey Contributors
// @match        https://example.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_log
// ==/UserScript==

// ---------------------------------------------------------------------------
// Hello OpenMonkey — example only.
//
// This is a minimal example userscript shipped with OpenMonkey for Safari to
// demonstrate installation, GM APIs, and stored values. It is NOT a
// functional tool: it only adds a banner to https://example.com and counts
// how many times you have visited that site.
//
// To try it: install this file in OpenMonkey, then open https://example.com.
// ---------------------------------------------------------------------------

(function () {
    'use strict';

    // Style the banner via GM_addStyle.
    GM_addStyle(`
        #openmonkey-hello-banner {
            position: fixed;
            top: 12px;
            right: 12px;
            z-index: 999999;
            padding: 10px 14px;
            border-radius: 8px;
            background: #1a73e8;
            color: #ffffff;
            font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        }
    `);

    // Read the stored visit count (default 0), increment it, and store it back.
    // GM_getValue / GM_setValue are namespaced per script, so no other
    // script can read or overwrite this value.
    const previousVisits = GM_getValue('visits', 0);
    const visits = previousVisits + 1;
    GM_setValue('visits', visits);

    GM_log('Hello OpenMonkey: visit #' + visits + ' to example.com');

    // Add the banner to the page.
    const banner = document.createElement('div');
    banner.id = 'openmonkey-hello-banner';
    banner.textContent = 'Hello from OpenMonkey! Visit #' + visits;
    document.body.appendChild(banner);
})();
