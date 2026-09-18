// ==UserScript==
// @name         ListenBrainz Fancy Profiles
// @namespace    http://tampermonkey.net/
// @version      2026-09-18
// @description  User bios from MusicBrainz and custom profile pictures for ListenBrainz
// @author       uart (https://uart.sh)
// @downloadURL  https://raw.github.com/serialuart/listenbrainz-userscripts/main/lb_fancy_profiles.user.js
// @updateURL    https://raw.github.com/serialuart/listenbrainz-userscripts/main/lb_fancy_profiles.user.js
// @match        *://listenbrainz.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=listenbrainz.org
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // Username for currently opened page.
    var username = location.pathname.split("/")[2];

    // User info as an object. Filled in with user data by the fetchUserInfo function;
    // initially null.
    var userInfo = null;

    GM_addStyle(`
        #lbfp-profile-info {
            padding: 15px 10px;
            display: flex;
        }

        #lbfp-profile-info > .loading-spinner { display: none; color: var(--bs-secondary-color); opacity: 0.5; text-align: center; }

        #lbfp-profile-info.loading > * { display: none; }
        #lbfp-profile-info.loading > .loading-spinner { display: block; }

        #lbfp-profile-info > .bio > .no-bio { color: var(--bs-secondary-color); opacity: 0.5; }
        #lbfp-profile-info > .bio > p { margin-bottom: 5px; }
        #lbfp-profile-info > .bio > *:last-child { margin-bottom: 0; }

        #lbfp-profile-info > hr { margin: 10px 0; }

        #lbfp-profile-info > .mini-info-container { font-size: .875em; color: var(--bs-secondary-color); }
        #lbfp-profile-info > .mini-info-container > span:not(:last-child):after { content: '•'; opacity: 0.75; margin: 0 6px; }
    `);

    // https://www.geeksforgeeks.org/javascript/how-to-escape-unescape-html-characters-in-string-in-javascript/
    function escapeHTML(inputStr) {
        return inputStr.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* Create a profile card, if possible. */
    function createProfileCard() {
        // Check if the card already exists; if so, don't do anything.
        if (document.getElementById("lbfp-profile-info")) {
            return;
        }

        // Try to get the user page sidebar. (If this fails, the page probably
        // hasn't loaded yet; the MutationObserver will fire again once it notices
        // a change.)
        const sidebar = document.querySelector("#dashboard > .row:first-child > .side-column");
        if (!sidebar) {
            return;
        }

        const fragment = new DocumentFragment();

        const card = document.createElement("div");
        card.id = "lbfp-profile-info";
        card.classList.add("card");
        card.classList.add("loading");
        fragment.append(card);

        const loadingSpinner = document.createElement("div");
        loadingSpinner.classList.add("loading-spinner");
        loadingSpinner.innerText = "Loading...";
        card.append(loadingSpinner);

        const bio = document.createElement("div");
        bio.classList.add("bio");
        card.append(bio);

        const hr = document.createElement("hr");
        card.append(hr);

        const miniInfoContainer = document.createElement("div");
        miniInfoContainer.classList.add("mini-info-container");
        card.append(miniInfoContainer);

        ["age", "gender", "country", "homepage", "member-since", "edit-count"].forEach((itemName) => {
            var el = document.createElement("span");
            el.classList.add(itemName);
            miniInfoContainer.append(el);
        });

        sidebar.insertBefore(fragment, sidebar.children[1]);

        // If fetchUserInfo finished before we created the card, prefill it with
        // user information; otherwise, fetchUserInfo will call this method itself
        if (userInfo) {
            fillProfileCard(card);
        }
    };

    /* Fill profile card with user information. */
    function fillProfileCard(card) {
        // Fill bio
        var bio = card.querySelector(".bio");
        if (userInfo.bio) {
            // The bio we receive from musicbrainz.org *should* already be properly escaped
            // and ready to be included verbatim; however, just to be sure, we sanitize the
            // input and only pass through known markup.
            //
            // (Fun fact - user bios follow edit note markup (https://musicbrainz.org/doc/Edit_Note)!)

            function sanitize(node) {
                node.childNodes.forEach((child) => {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        if (!["A", "BDI", "EM", "STRONG", "P"].includes(child.tagName)) {
                            node.insertBefore(document.createTextNode(child.textContent), child);
                            node.removeChild(child);
                        } else {
                            sanitize(child);
                        }
                    }
                });
            };

            sanitize(userInfo.bio);

            bio.innerHTML = userInfo.bio.innerHTML;
        } else {
            bio.innerHTML = '<span class="no-bio">This user is shrouded in mystery.</span>';
        }

        // Fill remaining data.

        function setMiniInfo(name, value, valueIsHTML) {
            var el = card.querySelector(`.${name}`);
            if (!el) {
                return;
            }
            if (value) {
                if (valueIsHTML) {
                    el.innerHTML = value;
                } else {
                    el.textContent = value;
                }
                el.style.display = "inline-block";
            } else {
                el.textContent = "";
                el.style.display = "none";
            }
        };

        setMiniInfo("age", userInfo.age, false);
        setMiniInfo("gender", userInfo.gender, false);

        // TODO: Flags for countries
        var country = null;
        if (userInfo.location && userInfo.location.children) {
            country = userInfo.location.children[userInfo.location.children.length - 1].textContent;
        }
        setMiniInfo("country", country, false);

        var el = card.querySelector(".homepage");
        if (el) {
            if (userInfo.homepage) {
                const url = new URL(userInfo.homepage);
                el.innerHTML = `<a href="${escapeHTML(userInfo.homepage)}" rel="nofollow">${url.hostname}</a>`;
                el.style.display = "inline-block";
            } else {
                el.textContent = "";
                el.style.display = "none";
            }
        }

        var memberSincePretty = null;
        if (userInfo.memberSince) {
            var date = userInfo.memberSince.split(" ")[0]; // YYYY-MM-DD
            var day = date.split("-")[2];
            var monthName = [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                ][Number(date.split("-")[1])-1];
            var year = date.split("-")[0];
            var datePretty = `${monthName} ${day}, ${year}`;

            memberSincePretty = `Member since <strong>${escapeHTML(datePretty)}</strong>`;
        }
        setMiniInfo("member-since", memberSincePretty, true);

        var editCountPretty = null;
        if (userInfo.editCount) {
            editCountPretty = `<strong>${escapeHTML(userInfo.editCount)}</strong> MusicBrainz edits`;
        }
        setMiniInfo("edit-count", editCountPretty, true);

        card.classList.remove("loading");
    }

    /* Get user information from MusicBrainz. */
    function fetchUserInfo() {
        GM.xmlHttpRequest({
            method: "GET",
            url: `https://musicbrainz.org/user/${username}`,
            headers: {
                "User-Agent": "ListenBrainz Fancy Profiles userscript (https://uart.sh/lbfp)",
                "Accept": "text/html"
            },
            onload: function(response) {
                var responseXML = response.responseXML;

                // Profile information is stored in a table with class .profileinfo.
                // Unfortunately the fields don't have subclasses (except for the bio),
                // fortunately we can parse it in JS :)

                var _userInfo = {};

                const profileInfoTable = responseXML.querySelector(".profileinfo > tbody");
                profileInfoTable.childNodes.forEach((row) => {
                    var th = row.querySelector("th");
                    var td = row.querySelector("td");

                    if (!th || !td) {
                        return;
                    }

                    switch (th.textContent) {
                        case "Location:":
                            // We preserve the full location HTML for later parsing
                            _userInfo.location = td;
                            break;
                        case "Age:":
                            _userInfo.age = td.textContent;
                            break;
                        case "Gender:":
                            _userInfo.gender = td.textContent;
                            break;
                        case "Member since:":
                            _userInfo.memberSince = td.textContent;
                            break;
                        case "Homepage:":
                            var link = td.querySelector("a");
                            if (link) {
                                _userInfo.homepage = link.href;
                            }
                            break;
                        // Bio is fetched separately
                    }
                });

                const editStatsTable = responseXML.querySelector(".statistics > tbody");
                editStatsTable.childNodes.forEach((row) => {
                    var th = row.querySelector("th");
                    var td = row.querySelector("td");

                    if (!th || !td) {
                        return;
                    }

                    switch (th.textContent) {
                        case "Total":
                            _userInfo.editCount = td.textContent.split(" ")[0];
                            break;
                        case "Total applied":
                            _userInfo.editCountApplied = td.textContent.split(" ")[0];
                            break;
                    }
                });

                var bio = responseXML.querySelector(".profileinfo .biography > td");
                _userInfo.bio = bio;

                userInfo = _userInfo;

                console.log(userInfo);

                var card = document.getElementById("lbfp-profile-info");
                if (card) {
                    fillProfileCard(card);
                }
            },
        });
    }

    /* Check if profile needs to be refreshed; if so, refresh it. */
    function checkIfProfileRefreshNeeded() {
        console.log("checkIfProfileRefreshNeeded called");

        // If we're not browsing a user page, clear user info
        if (location.pathname.split("/")[1] != "user") {
            userInfo = null;
            username = "";
            return;
        };

        var newUsername = location.pathname.split("/")[2];
        console.log(location.pathname, newUsername, username);
        if (newUsername == username) {
            return;
        }
        username = newUsername;

        var card = document.getElementById("lbfp-profile-info");
        if (card) {
            card.classList.add("loading");
            // Loading state will be updated by fillProfileCard called from fetchUserInfo
        }

        fetchUserInfo();
    };

    fetchUserInfo();
    createProfileCard();
    new MutationObserver(createProfileCard).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(checkIfProfileRefreshNeeded).observe(document.head, { childList: true, subtree: true });
})();
