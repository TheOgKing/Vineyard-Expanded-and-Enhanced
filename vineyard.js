import { openDB, deleteDB, wrap, unwrap } from 'https://cdn.jsdelivr.net/npm/idb@7/+esm';

const SCAN_DELAY = 1000;
const INNER_SCAN_DELAY = 0;
const RESCAN_TIME = 1000 * 60 * 60 * 24 * 14;
const HIDDEN_OPACITY = 0.3;
const MAX_VARIANTS = 1; // only scan up to 3 variants per item
const NEW_PERIOD = 1000 * 60 * 30; // items first seen in the past 30 min are "new"
const thirtyMinutes = 30 * 60 * 1000;

let totalItemsToScan = 0;
let itemsScanned = 0;
let freeItemsCount = 0;
let keywordItemsCount = 0; // Added to keep track of keyword matches
let newItemsCount = 0;

(function() {
    'use strict';

    function blockLogging() {
        if (window.ue && window.ueLogError) {
            const originalLogError = window.ueLogError;
            window.ueLogError = function() {
                console.log('Error logging blocked.');
            };
        } else {
            console.log('ueLogError not found');
        }
    }

    // Try to block logging immediately
    blockLogging();

    // Also listen for the DOMContentLoaded event to try again
    document.addEventListener('DOMContentLoaded', blockLogging);
})();

// Declare the db variable in a higher scope
let db;

async function initializeWishlistDB() {
    return await openDB('wishlistDB', 1, {
        upgrade(db, oldVersion, newVersion, transaction) {
            if (oldVersion < 1) {
                const itemStore = db.createObjectStore('wishlist', { keyPath: 'ASIN' });
                itemStore.createIndex('productName', 'productName', { unique: false });
            }
        }
    });
}

let wishlistDB = initializeWishlistDB();

function addInitialScanCount() {
    const resultsParagraph = document.querySelector('#vvp-items-grid-container p');

    if (!resultsParagraph) return;

    // Check if scanning information element already exists
    let scanningInfoElement = resultsParagraph.querySelector('.scanning-info');
    
    if (!scanningInfoElement) {
        // Create a new span element for scanning information
        scanningInfoElement = document.createElement('span');
        scanningInfoElement.classList.add('scanning-info');
        scanningInfoElement.innerHTML = ` | Scanned: <strong>0</strong> out of <strong>${totalItemsToScan}</strong>. | <strong>0</strong> free items | <strong>0</strong> keywords found | <strong>0</strong> new items`;

        // Append the new element to the original paragraph
        resultsParagraph.appendChild(scanningInfoElement);
    }
}

// Define a variable to keep track of the mute state
let isMuted = localStorage.getItem('isMuted') === 'true';
let scanSoundLink = localStorage.getItem('scanSoundLink') || 'https://www.myinstants.com/media/sounds/heyo.mp3';
let keywords = localStorage.getItem('keywords') ? localStorage.getItem('keywords').split(', ') : []; // Retrieve saved keywords
let isKeywordHighlightingEnabled = localStorage.getItem('isKeywordHighlightingEnabled') === 'true'; // Retrieve keyword highlighting state

// Define the scan sound function
function scanSound() {
    if (!isMuted) { // Only play sound if not muted
        const audio = new Audio(scanSoundLink);
        audio.play();
    }
}

// Define a function to toggle mute/unmute and update button appearance
function toggleSound() {
    // Toggle the mute state
    isMuted = !isMuted;

    // Save the mute state in localStorage
    localStorage.setItem('isMuted', isMuted);

    // Update button appearance based on mute state
    const soundButton = document.getElementById('sound-button');
    if (soundButton) {
        soundButton.classList.toggle('a-button-selected');
        soundButton.querySelector('.a-button-text').textContent = isMuted ? 'Unmute Sound' : 'Mute Sound';
    }
}

// Define a function to toggle keyword highlighting and update button appearance
function toggleKeywordHighlighting() {
    // Toggle the keyword highlighting state
    isKeywordHighlightingEnabled = !isKeywordHighlightingEnabled;

    // Save the keyword highlighting state in localStorage
    localStorage.setItem('isKeywordHighlightingEnabled', isKeywordHighlightingEnabled);

    // Update button appearance based on keyword highlighting state
    const keywordToggleButton = document.getElementById('keyword-toggle-button');
    if (keywordToggleButton) {
        keywordToggleButton.classList.toggle('a-button-selected');
        keywordToggleButton.querySelector('.a-button-text').textContent = isKeywordHighlightingEnabled ? 'Keywords On' : 'Keywords Off';
    }
}

// Define a function to open a dialog box and update the scan sound link
function updateScanSoundLink() {
    const currentLink = localStorage.getItem('scanSoundLink') || 'No link set';
    const newLink = prompt(`Enter the new link for the scan sound:`, currentLink);
    if (newLink !== null) {
        scanSoundLink = newLink;
        localStorage.setItem('scanSoundLink', scanSoundLink);
    }
}

// Define a function to open a dialog box and update the keywords
function updateKeywords() {
    const newKeywords = prompt('Enter the keywords to monitor (separated by commas):', keywords.join(', '));
    if (newKeywords !== null) {
        keywords = newKeywords.split(', ').map(keyword => keyword.trim());
        localStorage.setItem('keywords', keywords.join(', '));
    }
}

// Function to add buttons
function addButtons() {
    const buttonContainer = document.getElementById('vvp-items-button-container');
    const searchBox = document.getElementById('vvp-search-text-input');

    if (!searchBox || !buttonContainer) return;

    // Create HTML markup for the sound button
    const soundButtonHTML = `
        <span id="sound-button" class="a-button a-button-normal a-button-toggle${isMuted ? ' a-button-selected' : ''}" role="radio">
            <span class="a-button-inner">
                <a class="a-button-text">${isMuted ? 'Unmute Sound' : 'Mute Sound'}</a>
            </span>
        </span>
    `;

    // Create HTML markup for the keyword toggle button
    const keywordToggleButtonHTML = `
        <span id="keyword-toggle-button" class="a-button a-button-normal a-button-toggle${isKeywordHighlightingEnabled ? ' a-button-selected' : ''}" role="radio">
            <span class="a-button-inner">
                <a class="a-button-text">${isKeywordHighlightingEnabled ? 'Keywords On' : 'Keywords Off'}</a>
            </span>
        </span>
    `;

    // Insert the sound button HTML before the search box
    searchBox.parentNode.insertBefore(document.createRange().createContextualFragment(soundButtonHTML), searchBox);

    // Insert the keyword toggle button HTML before the search box
    searchBox.parentNode.insertBefore(document.createRange().createContextualFragment(keywordToggleButtonHTML), searchBox);

    // Add event listener to the sound button
    const soundButton = document.getElementById('sound-button');
    if (soundButton) {
        soundButton.addEventListener('click', toggleSound);
    }

    // Add event listener to the keyword toggle button
    const keywordToggleButton = document.getElementById('keyword-toggle-button');
    if (keywordToggleButton) {
        keywordToggleButton.addEventListener('click', toggleKeywordHighlighting);
    }
}

// Define the function to show scanned items in a modal
let currentPage = 1;
const itemsPerPage = 15;
let filteredItems = [];
let allItems = [];
let sortOrderName = 'asc';
let sortOrderPrice = 'asc';

async function showScannedItems() {
    const scannedItemsList = document.getElementById('scanned-items-list');
    allItems = await db.getAll('items');
    filteredItems = allItems.filter(item => item.variants && item.variants[item.ASIN] && item.variants[item.ASIN].taxValue !== 'N/A');
    displayItems(filteredItems);
    document.getElementById('scannedItemsModal').style.display = 'block';
}

function displayItems(items) {
    const scannedItemsList = document.getElementById('scanned-items-list');
    scannedItemsList.innerHTML = ''; // Clear previous content

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const itemsToDisplay = items.slice(start, end);

    itemsToDisplay.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'tile';
        itemDiv.innerHTML = `
            <div class="image-container" id="image-container-${item.ASIN}" style="max-height: 100px; overflow: hidden;">
                <button onclick="showImage('${item.ASIN}', '${item.imageURL}')">See Picture</button>
            </div>
            <strong class="product-name"><a href="https://www.amazon.com/dp/${item.ASIN}" target="_blank">${item.productName}</a></strong><br>
            $${item.variants[item.ASIN].taxValue}<br>
            Free: ${item.variants[item.ASIN].taxValue === 0 ? 'Yes' : 'No'}<br>
            Found: ${new Date(item.foundDate).toLocaleString()}<br>
            Last Scanned: ${new Date(item.lastScanDate).toLocaleString()}
        `;
        scannedItemsList.appendChild(itemDiv);
    });

    updatePaginationControls();
}

function updatePaginationControls() {
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage === totalPages;
}

window.nextPage = function() {
    currentPage++;
    displayItems(filteredItems);
}

window.prevPage = function() {
    currentPage--;
    displayItems(filteredItems);
}

window.filterItems = function() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    filteredItems = allItems.filter(item =>
        (item.productName.toLowerCase().includes(query) ||
        item.ASIN.toLowerCase().includes(query)) &&
        item.variants && item.variants[item.ASIN] && item.variants[item.ASIN].taxValue !== 'N/A'
    );
    currentPage = 1;
    displayItems(filteredItems);
}

window.sortItemsByName = function() {
    if (sortOrderName === 'asc') {
        filteredItems.sort((a, b) => a.productName.localeCompare(b.productName));
        sortOrderName = 'desc';
    } else if (sortOrderName === 'desc') {
        filteredItems.sort((a, b) => b.productName.localeCompare(a.productName));
        sortOrderName = 'num';
    } else {
        filteredItems.sort((a, b) => {
            if (isNaN(a.productName.charAt(0))) return 1;
            if (isNaN(b.productName.charAt(0))) return -1;
            return a.productName.localeCompare(b.productName);
        });
        sortOrderName = 'asc';
    }
    currentPage = 1;
    displayItems(filteredItems);
}

window.sortItemsByPrice = function() {
    if (sortOrderPrice === 'asc') {
        filteredItems.sort((a, b) => (a.variants[a.ASIN]?.taxValue || 0) - (b.variants[b.ASIN]?.taxValue || 0));
        sortOrderPrice = 'desc';
    } else {
        filteredItems.sort((a, b) => (b.variants[b.ASIN]?.taxValue || 0) - (a.variants[a.ASIN]?.taxValue || 0));
        sortOrderPrice = 'asc';
    }
    currentPage = 1;
    displayItems(filteredItems);
}

window.sortByDate = function() {
    if (sortOrder === 'newest') {
        filteredItems.sort((a, b) => new Date(b.lastScanDate) - new Date(a.lastScanDate));
        sortOrder = 'oldest';
    } else {
        filteredItems.sort((a, b) => new Date(a.lastScanDate) - new Date(b.lastScanDate));
        sortOrder = 'newest';
    }
    currentPage = 1;
    displayItems(filteredItems);
}

window.showImage = function(ASIN, imageURL) {
    const container = document.getElementById(`image-container-${ASIN}`);
    container.innerHTML = `<img src="${imageURL}" style="width: 100%; height: auto;" onclick="showImageFullscreen('${imageURL}')" />`;
}

window.showImageFullscreen = function(imageURL) {
    const fullscreenDiv = document.createElement('div');
    fullscreenDiv.id = 'fullscreen-image';
    fullscreenDiv.style.position = 'fixed';
    fullscreenDiv.style.top = '0';
    fullscreenDiv.style.left = '0';
    fullscreenDiv.style.width = '100%';
    fullscreenDiv.style.height = '100%';
    fullscreenDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    fullscreenDiv.style.zIndex = '1000';
    fullscreenDiv.innerHTML = `<img src="${imageURL}" style="width: 80%; height: auto; margin: 5% auto; display: block;" /><button onclick="closeFullscreen()">Close</button>`;

    document.body.appendChild(fullscreenDiv);
}

window.closeFullscreen = function() {
    const fullscreenDiv = document.getElementById('fullscreen-image');
    if (fullscreenDiv) {
        fullscreenDiv.remove();
    }
}

// Close fullscreen image on ESC key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeFullscreen();
    }
});


(async function () {
    db = await openDB('vineyard', 6, {
        upgrade(db, oldVersion, newVersion, transaction) {
            if (oldVersion < 6) {
                const itemStore = db.createObjectStore('items', {
                    keyPath: 'ASIN',
                });
                itemStore.createIndex('foundDate', 'foundDate', {
                    unique: false
                });
                itemStore.createIndex('lastScanDate', 'lastScanDate', {
                    unique: false
                });
                itemStore.createIndex('productName', 'productName', {
                    unique: false
                });
            }
        }
    });

    let todoQueue = [];
    let todoRunning = false;

    function runQueue() {
        if (!todoRunning && todoQueue.length > 0) {
            todoRunning = true;
            performDeepScan(todoQueue.shift());
        } else {
            updateSortButtonState(); // Update button state even if there's no more items in the queue
        }
    }

    function updateScanCount() {
        const resultsParagraph = document.querySelector('#vvp-items-grid-container p');
    
        if (!resultsParagraph) return;

        // Check if scanning information element already exists
        let scanningInfoElement = resultsParagraph.querySelector('.scanning-info');
        
        if (!scanningInfoElement) {
            // If it doesn't exist, create and append it
            scanningInfoElement = document.createElement('span');
            scanningInfoElement.classList.add('scanning-info');
            resultsParagraph.appendChild(scanningInfoElement);
        }
    
        // Update the content of the scanning information
        scanningInfoElement.innerHTML = ` | Scanned: <strong>${itemsScanned}</strong> out of <strong>${totalItemsToScan}</strong>. | <strong>${freeItemsCount}</strong> free items | <strong>${keywordItemsCount}</strong> keywords found | <strong>${newItemsCount}</strong> new items`;
    }
    
    async function performDeepScan(item) {
        if (!item.hidden) {
            console.log(`will deep scan ${item.ASIN}`);
            updateSortButtonState(); // Update button state

            const variants = {};
            if (item.parentASIN) {
                // scan for recommendations
                const resp = await fetch(`https://www.amazon.com/vine/api/recommendations/${encodeURIComponent(item.dataRecID)}`);
                if (resp.status == 200) {
                    const blob = await resp.json();
                    if (!blob.error) {
                        for (const variant of blob.result.variations) {
                            variants[variant.asin] = {
                                dimensions: variant.dimensions,
                            };
                        }
                    }
                }
            } else {
                variants[item.ASIN] = {};
            }
            let variantsScanned = 0;
            for (const variantASIN of Object.keys(variants)) {
                if (variantsScanned > MAX_VARIANTS) {
                    break;
                }
                console.log(`looking at variant ${variantASIN}`);
                const resp = await fetch(`https://www.amazon.com/vine/api/recommendations/${encodeURIComponent(item.dataRecID)}/item/${variantASIN}?imageSize=180`);
                if (resp.status == 200) {
                    const blob = await resp.json();
                    console.log(blob);
                    if (!blob.error) {
                        variants[variantASIN].byline = blob.result.byLineContributors;
                        variants[variantASIN].limited = blob.result.limitedQuantity;
                        variants[variantASIN].catSize = blob.result.catalogSize;
                        variants[variantASIN].taxValue = blob.result.taxValue;
                        variants[variantASIN].taxCurr = blob.result.taxCurrency;

                        // Trigger ETV sharing if the value is found
                        if (variants[variantASIN].taxValue !== undefined) {
                            window.postMessage({
                                type: 'etv',
                                data: {
                                    asin: variantASIN,
                                    parent_asin: item.parentASIN ? item.ASIN : null,
                                    etv: variants[variantASIN].taxValue,
                                },
                            }, '*');
                        }
        
                        if (variants[variantASIN].taxValue === 0) {
                            freeItemsCount++;
                            scanSound();
                        }
                    }
                }
                variantsScanned++;
                await new Promise((resolve) => setTimeout(resolve, INNER_SCAN_DELAY)); // force min delay between scans
            }
            item.variants = variants;
            item.lastScanDate = new Date();
            // save over
            await db.put('items', item);
            // Move the updateScanCount here, after the deep scan is complete
            itemsScanned++;
            updateScanCount();
        }
        // find item and render too ...
        renderItem(document.querySelector(`[data-recommendation-id="${item.dataRecID}"]`), item);
        await new Promise((resolve) => setTimeout(resolve, SCAN_DELAY)); // force min delay between scans
        todoRunning = false;
        runQueue();
    }

    async function renderLoadingItem(element, item) {
        element.insertAdjacentHTML("afterbegin", `
        <div class="vineyard-content" data-asin="${item.ASIN}">
            <div class="vineyard-flex">
                <div class="vineyard-label">
                    <span class="vineyard-price">Loading ...</span>
                </div>
                <div class="vineyard-btns">
                    <button class="vineyard-trash">🗑️</button>
                </div>
            </div>
        </div>`);
    }

    async function renderItem(element, item) {
        if (item.hidden) {
            element.style.opacity = HIDDEN_OPACITY;
        } else {
            element.style.opacity = 1;
        }

        if (item.interested === true) {
            element.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
        } else if (item.interested === false) {
            element.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
        } else if (!item.hidden) {
            if (new Date() - item.foundDate < NEW_PERIOD) {
                element.style.backgroundColor = 'rgba(255, 215, 0, 0.2)';
            }
        }

        // Highlight items matching keywords if the feature is enabled
        if (isKeywordHighlightingEnabled) {
            const keywords = localStorage.getItem('keywords') ? localStorage.getItem('keywords').split(', ') : [];
            const itemName = item.productName.toLowerCase();
            const keywordMatch = keywords.some(keyword => itemName.includes(keyword.toLowerCase()));
            if (keywordMatch) {
                element.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
                keywordItemsCount++;
            }
        }

        const existingOverlay = element.querySelector(':scope > .vineyard-content');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        const variantCount = Object.keys(item.variants).length;
        let priceLow, priceHigh;
        if (variantCount > 0) {
            priceLow = item.variants[Object.keys(item.variants).reduce((a, b) => item.variants[a].taxValue < item.variants[b].taxValue ? a : b)].taxValue;
            priceHigh = item.variants[Object.keys(item.variants).reduce((a, b) => item.variants[a].taxValue > item.variants[b].taxValue ? a : b)].taxValue;
            if (variantCount == 1) {
                priceHigh = "";
            } else {
                priceHigh = ` - $${priceHigh}`;
            }
        } else {
            priceLow = "Pending";
            priceHigh = "";
        }
        const isInterested = item.interested === true ? " active" : "";
        const isNotInterested = item.interested === false ? " active" : "";
        const isTrash = item.hidden ? " active" : "";
        element.insertAdjacentHTML("afterbegin", `
        <div class="vineyard-content" data-asin="${item.ASIN}">
            <div class="vineyard-flex">
                <div class="vineyard-label">
                <span class="vineyard-price"${
                    item.variants && item.variants[item.ASIN] && item.variants[item.ASIN].taxValue === 0 ? ' style="background-color: yellow; margin-left: 10px; padding: 0 110px;"' : ' style="margin-left: 10px; padding: 0 5px;"'
                }>${priceLow}${priceHigh}</span>
                    <span class="vineyard-variants">${variantCount} variants</span>
                </div>
                <div class="vineyard-btns">
                    <button class="vineyard-interested${isInterested}">👍</button>
                    <button class="vineyard-notinterested${isNotInterested}">👎</button>
                    <button class="vineyard-trash${isTrash}">🗑️</button>
                    <button class="vineyard-gift">🎁</button> <!-- Added Gift button -->
                </div>
            </div>
        </div>`);
    }

    async function scanItem(element, item) {
        const lastScan = new Date() - item.lastScanDate;
        if (lastScan > RESCAN_TIME) {
            renderLoadingItem(element, item);
            todoQueue.push(item);
            console.log(`queued ${item.ASIN}`);
            runQueue();
            return;
        }
        renderItem(element, item);
        itemsScanned++; // Increment items scanned
        updateScanCount(); // Update the scan count
    }
    

    async function lookForItems() {
        const itemElements = document.querySelectorAll('.vvp-item-tile');
        if (!itemElements.length) return;

        totalItemsToScan = itemElements.length;
        itemsScanned = totalItemsToScan - document.querySelectorAll('.vvp-item-tile[data-recommendation-id]').length;

        for (const itemEl of itemElements) {
            const itemRecID = itemEl.dataset.recommendationId;

            const [marketplaceID, ASIN] = itemRecID.split('#');
            let item = await db.get('items', ASIN);
            if (item === undefined) {
                const imageURL = itemEl.dataset.imgUrl;
                const itemLink = itemEl.querySelector(':scope .a-truncate-full');
                const itemBtn = itemEl.querySelector(':scope input');

                item = {
                    ASIN,
                    foundDate: new Date(),
                    marketplaceID,
                    productName: itemLink.textContent,
                    imageURL,
                    initialRecType: itemBtn.dataset.recommendationType,
                    dataRecID: itemRecID,
                    parentASIN: itemBtn.dataset.isParentAsin === 'true',
                    deepASIN: itemBtn.dataset.asin,
                    lastScanDate: null,
                    hidden: false,
                    interested: null,
                    variants: {},
                };
                await db.add('items', item);
            }
            item.dataRecID = itemRecID;
    
            // Update freeItemsCount based on tax value
            if (item.variants && item.variants[item.ASIN] && item.variants[item.ASIN].taxValue === 0) {
                freeItemsCount++;
            }
            

            // Compare the difference in time
            if (new Date() - new Date(item.foundDate) < thirtyMinutes) {
                newItemsCount++;
            }
    
            // Check if scanning is stopped
            if (localStorage.getItem('vineyardScanState') !== 'true') {
                await scanItem(itemEl, item);
            } else {
                renderItem(itemEl, item); // Render the item without scanning
            }
        }
    }

    async function markInterested(e) {
        const ASIN = e.dataset.asin;
        const item = await db.get('items', ASIN);
        if (item !== undefined) {
            if (item.interested === true) {
                item.interested = null;
            } else {
                item.hidden = false;
                item.interested = true;
            }
            await db.put('items', item);
            renderItem(e.closest(".vvp-item-tile"), item);
        }
    }

    async function markNotInterested(e) {
        const ASIN = e.dataset.asin;
        const item = await db.get('items', ASIN);
        if (item !== undefined) {
            if (item.interested === false) {
                item.interested = null;
            } else {
                item.interested = false;
            }
            await db.put('items', item);
            renderItem(e.closest(".vvp-item-tile"), item);
        }
    }

    async function markTrash(e) {
        const ASIN = e.dataset.asin;
        const item = await db.get('items', ASIN);
        if (item !== undefined) {
            item.hidden = !item.hidden;
            item.interested = null;
            await db.put('items', item);
            todoQueue = todoQueue.filter(function (e) { return e !== ASIN; });
            renderItem(e.closest(".vvp-item-tile"), item);
        }
    }

    async function saveToWishlist(tile) {
        const ASIN = tile.querySelector('.vineyard-content').dataset.asin;
        const item = await db.get('items', ASIN);
        if (item) {
            wishlistDB = await wishlistDB;
            await wishlistDB.put('wishlist', item);
            alert('Item added to wishlist!');
        } else {
            alert('Error adding item to wishlist.');
        }
    }
    
    document.addEventListener("click", function (e) {
        if (e.target && e.target.matches(".vineyard-interested")) {
            markInterested(e.target.closest(".vineyard-content"));
        } else if (e.target && e.target.matches(".vineyard-notinterested")) {
            markNotInterested(e.target.closest(".vineyard-content"));
        } else if (e.target && e.target.matches(".vineyard-trash")) {
            markTrash(e.target.closest(".vineyard-content"));
        } else if (e.target && e.target.matches(".vineyard-gift")) {
            saveToWishlist(e.target.closest(".vvp-item-tile")); // Handle Gift button click
        }
    });

    // Define sortProductsByETV function to sort product tiles by ETV
    function sortProductsByETV(sortOrder = 'asc') {
        const productTiles = document.querySelectorAll('.vvp-item-tile');
        const sortedTiles = Array.from(productTiles).filter(tile => {
            const priceElement = tile.querySelector('.vineyard-price');
            return priceElement && priceElement.textContent;
        }).sort((a, b) => {
            const priceAElement = a.querySelector('.vineyard-price');
            const priceBElement = b.querySelector('.vineyard-price');
    
            if (!priceAElement || !priceBElement) {
                return 0;
            }
    
            let etvA = priceAElement.textContent.replace('$', '').trim();
            let etvB = priceBElement.textContent.replace('$', '').trim();
    
            // Handle cases where price is undefined or "undefined - undefined"
            if (etvA === '' || etvA === 'undefined - undefined') {
                return -1; // Place item A at the top
            } else if (etvB === '' || etvB === 'undefined - undefined') {
                return 1; // Place item B at the top
            }
    
            etvA = parseFloat(etvA);
            etvB = parseFloat(etvB);
    
            if (sortOrder === 'asc') {
                return etvA - etvB;
            } else {
                return etvB - etvA;
            }
        });
    
        // Get the container to append sorted product tiles
        const container = document.getElementById('vvp-items-grid');
        // Clear the container
        container.innerHTML = '';
        // Append sorted product tiles
        sortedTiles.forEach(tile => {
            container.appendChild(tile);
        });
    }
    
    

    function addSortButton() {
        const sortButtonHTML = `
            <span id="price-sorting" class="a-button a-button-normal a-button-toggle" role="price">
                <span class="a-button-inner">
                    <a id="sort-button" class="a-button-text">Sort By Price</a>
                </span>
            </span>
        `;
        const searchBox = document.getElementById('vvp-search-text-input');
        const soundButton = document.getElementById('sound-button'); // Find the mute button
    
        if (!searchBox || !soundButton) return;
    
        // Insert the sort button HTML before the sound button
        searchBox.parentNode.insertBefore(document.createRange().createContextualFragment(sortButtonHTML), soundButton);
    
        // Add event listener to the sort button
        const sortButton = document.getElementById('sort-button');
        if (sortButton) {
            sortButton.addEventListener('click', handleSortButtonClick);
        }
    }

    // Function to handle click event on the sort button
    function handleSortButtonClick() {
        // Check if a deep scan is currently running
        if (todoRunning) {
            // If a deep scan is running, return early without sorting
            return;
        }

        // Get the sort button element
        const sortButton = document.getElementById('sort-button');
        
        // Check the current sorting order
        const sortOrder = sortButton.dataset.sortOrder || 'asc';
        
        // Toggle sorting order
        const newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        
        // Update button text based on sorting order
        sortButton.innerHTML = `Sort By Price (${newSortOrder === 'asc' ? 'Low to High' : 'High to Low'})`;
        
        // Update data attribute for next click
        sortButton.dataset.sortOrder = newSortOrder;

        // Sort products based on sorting order
        sortProductsByETV(newSortOrder);
    }

    // Function to update the text content of the sort button
    function updateSortButtonState() {
        // Get the sort button element
        const sortButton = document.getElementById('sort-button');
        if (!sortButton) return;

        // If a deep scan is running, update the button text to include strikethrough
        if (todoRunning) {
            sortButton.innerHTML = 'Wait For Scan To Finish';
        } else {
            // If not running, reset the button text to the original
            sortButton.innerHTML = 'Sort By Price';
        }
    }

    // Update the sort button state initially
    updateSortButtonState();
    addButtons();
    addSortButton();
    window.vineyard = db;
    addInitialScanCount();
    await lookForItems();
    
    function renderWishlist() {
        wishlistDB.then(async db => {
            const wishlistItems = await db.getAll('wishlist');
            const resourcesPage = document.getElementById('vvp-resources-page');
            if (resourcesPage) {
                resourcesPage.innerHTML = ''; // Clear previous content
    
                if (wishlistItems.length === 0) {
                    resourcesPage.innerHTML = `
                        <div class="vvp-tab-content">
                            <p class="paragraph-testing">You have no items in the wishlist so play with some colors in the meantime lmfao</p>
                            <iframe src="https://paveldogreat.github.io/WebGL-Fluid-Simulation/" class="bathbom"></iframe>
                        </div>
                    `;
                } else {
                    const itemsGridContainer = document.createElement('div');
                    itemsGridContainer.className = 'kings-items';
    
                    const statementParagraph1 = document.createElement('p');
                    statementParagraph1.className = 'kings-statement';
                    statementParagraph1.textContent = 'This is your Wishlist.';
                    
                    const statementParagraph2 = document.createElement('p');
                    statementParagraph2.className = 'kings-statement';
                    statementParagraph2.innerHTML = `
                        "Items that are available will show a search button." <span style="white-space:pre"> </span>
                        "Items that are unavailable will say "Unavailable"." <span style="white-space:pre"> </span>
                        "The search feature can be weird so check if the item is actually being searched when the new page opens" <span style="white-space:pre"> </span>
                        "Note that items with multiple variants are broken and will also show as "Unavailable", but will still display the search button to check if they actually are unavailable or not"
                    `;
                    
                    itemsGridContainer.appendChild(statementParagraph1);
                    itemsGridContainer.appendChild(statementParagraph2);
                    
                    const itemsGrid = document.createElement('div');
                    itemsGrid.id = 'vvp-items-grid';
                    itemsGrid.className = 'a-section';
    
                    wishlistItems.forEach(item => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'vvp-item-tile';
                        itemDiv.dataset.recommendationId = item.dataRecID;
                        itemDiv.dataset.imgUrl = item.imageURL;
                        itemDiv.style.opacity = 1;
    
                        let priceLow, priceHigh;
                        const variantCount = Object.keys(item.variants).length;
                        if (variantCount > 0) {
                            priceLow = item.variants[Object.keys(item.variants).reduce((a, b) => item.variants[a].taxValue < item.variants[b].taxValue ? a : b)].taxValue;
                            priceHigh = item.variants[Object.keys(item.variants).reduce((a, b) => item.variants[a].taxValue > item.variants[b].taxValue ? a : b)].taxValue;
                            if (variantCount == 1) {
                                priceHigh = "";
                            } else {
                                priceHigh = ` - $${priceHigh}`;
                            }
                        } else {
                            priceLow = "Pending";
                            priceHigh = "";
                        }
    
                        const productName = item.productName;
                        const searchQuery = productName.split(' ').slice(0, 3).join(' ');
    
                        itemDiv.innerHTML = `
                            <div class="vineyard-content" data-asin="${item.ASIN}">
                                <div class="vineyard-flex">
                                    <div class="vineyard-label">
                                        <span class="wishlist-price"${item.variants && item.variants[item.ASIN] && item.variants[item.ASIN].taxValue === 0 ? ' style="background-color: yellow; margin-left: 10px; padding: 0 110px;"' : ' style="margin-left: 10px; padding: 0 5px;"'}>${priceLow}${priceHigh}</span>
                                        <span class="vineyard-variants">${variantCount} variants</span>
                                    </div>
                                    <div class="vineyard-btns">
                                        <button class="vineyard-remove">❌</button>
                                    </div>
                                </div>
                            </div>
                            <div class="vvp-item-tile-content">
                                <img alt="" src="${item.imageURL}">
                                <div class="vvp-item-product-title-container">
                                    <a class="a-link-normal fs-link" target="_blank" rel="noopener" href="/dp/${item.ASIN}">
                                        <span class="a-truncate" data-a-word-break="normal" data-a-max-rows="2" data-a-overflow-marker="&hellip;" style="line-height: 1.3em !important; max-height: 2.6em;" data-a-recalculate="false" data-a-updated="true">
                                            <span class="a-truncate-full a-offscreen">${item.productName}</span>
                                            <span class="a-truncate-cut" aria-hidden="true" style="height: 2.6em;">${item.productName}</span>
                                        </span>
                                    </a>
                                </div>
                                <button type="button" class="a-button a-button-primary vvp-details-btn check-availability" data-itemrecid="${item.dataRecID}">
                                    <span class="a-button-inner">
                                        <span class="a-button-text">Check Availability</span>
                                    </span>
                                </button>
                            </div>
                        `;
    
                        // Handle removal of wishlist items
                        itemDiv.querySelector('.vineyard-remove').addEventListener('click', async () => {
                            await db.delete('wishlist', item.ASIN);
                            renderWishlist();
                        });
    
                        // Handle check availability click
                        itemDiv.querySelector('.check-availability').addEventListener('click', async (event) => {
                            const button = event.target.closest('.check-availability');
                            const itemRecID = button.dataset.itemrecid;
                            const [marketplaceID, ASIN] = itemRecID.split('#');
                            const itemURL = `https://www.amazon.com/vine/api/recommendations/${encodeURIComponent(itemRecID)}/item/${ASIN}?imageSize=180`;
    
                            try {
                                const response = await fetch(itemURL);
                                if (response.ok) {
                                    const blob = await response.json();
                                    if (!blob.error) {
                                        console.log(`Item ${ASIN} is available within the Vine program.`);
                                        console.log('Item details:', blob.result);
                                        button.innerHTML = `
                                            <span class="a-button-inner">
                                                <span class="a-button-text">Search</span>
                                            </span>
                                        `;
                                        button.classList.add('search-availability');
                                        button.classList.remove('check-availability');
                                        button.addEventListener('click', () => {
                                            window.open(`https://www.amazon.com/vine/vine-items?search=${searchQuery}`, '_blank');
                                        });
                                    } else if (variantCount > 1) {
                                        console.log(`Item ${ASIN} is unavailable within the Vine program but has multiple variants.`);
                                        button.innerHTML = `
                                            <span class="a-button-inner">
                                                <span class="a-button-text">Search</span>
                                            </span>
                                        `;
                                        button.classList.add('search-availability');
                                        button.classList.remove('check-availability');
                                        button.addEventListener('click', () => {
                                            window.open(`https://www.amazon.com/vine/vine-items?search=${searchQuery}`, '_blank');
                                        });
                                    } else {
                                        console.log(`Item ${ASIN} is unavailable within the Vine program.`);
                                        button.innerHTML = `
                                            <span class="a-button-inner">
                                                <span class="a-button-text">Unavailable</span>
                                            </span>
                                        `;
                                        button.classList.add('a-button-disabled');
                                        button.classList.remove('a-button-primary');
                                        button.classList.remove('check-availability');
                                        button.disabled = true;
                                        button.removeAttribute('data-itemrecid');
                                    }
                                } else {
                                    console.log(`Error fetching item ${ASIN} status within the Vine program:`, response.statusText);
                                    button.innerHTML = `
                                        <span class="a-button-inner">
                                            <span class="a-button-text">Error</span>
                                        </span>
                                    `;
                                    button.classList.add('a-button-disabled');
                                    button.classList.remove('a-button-primary');
                                    button.classList.remove('check-availability');
                                    button.disabled = true;
                                    button.removeAttribute('data-itemrecid');
                                }
                            } catch (error) {
                                console.log(`Error fetching item ${ASIN} status within the Vine program:`, error);
                                button.innerHTML = `
                                    <span class="a-button-inner">
                                        <span class="a-button-text">Error</span>
                                    </span>
                                `;
                                button.classList.add('a-button-disabled');
                                button.classList.remove('a-button-primary');
                                button.classList.remove('check-availability');
                                button.disabled = true;
                                button.removeAttribute('data-itemrecid');
                            }
                        });
    
                        // Handle items that may be unavailable or throw errors
                        fetch(`https://www.amazon.com/dp/${item.ASIN}`)
                            .then(response => {
                                if (!response.ok) {
                                    itemDiv.style.opacity = HIDDEN_OPACITY;
                                }
                            })
                            .catch(error => {
                                itemDiv.style.opacity = HIDDEN_OPACITY;
                            });
    
                        itemsGrid.appendChild(itemDiv);
                    });
    
                    itemsGridContainer.appendChild(itemsGrid);
                    resourcesPage.appendChild(itemsGridContainer);
                }
            }
        });
    }
    
    // Initialize the wishlist observer when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderWishlist);
    } else {
        renderWishlist();
    }
    
})();





(function() {
// Function to inject custom CSS into the document
    function injectCustomCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            .custom-modal-header h2 {
                margin: 0;
                font-size: 1.5em;
            }
            .custom-modal-body {
                margin: 20px 0;
            }
            .custom-button {
                display: inline-block;
                padding: 10px 20px;
                margin: 5px;
                font-size: 14px;
                color: #333;
                background-color: #f0f0f0;
                border: 1px solid #ccc;
                border-radius: 4px;
                cursor: pointer;
            }
            .custom-button:hover {
                background-color: #e0e0e0;
            }
            .custom-button-primary {
                background-color: #ff9900;
                color: white;
                border: 1px solid #ff9900;
            }
            .custom-button-primary:hover {
                background-color: #e68a00;
            }
            .timestamp-info {
                font-size: 12px;
                color: #999;
            }
            #vvp-logo-link {
                position: relative;
                left: 780px;
                top: -5px;
            }
            #vvp-logo-link img {
                display: block;
            }
            .custom-modal-content {
                display: none;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000;
                background: #1C1F26;
                padding: 20px;
                box-shadow: 0px 0px 10px rgb(255 255 255 / 50%);
                border-radius: 8px;
                max-height: 80vh; /* Set a maximum height */
                overflow-y: auto; /* Make the modal scrollable */
                color: white; /* Set all text to white */
            }
            
            #search-bar {
                width: 100%;
                padding: 10px;
                margin-bottom: 20px;
                color: black; /* Ensure the text inside the search bar is black */
            }
            
            .sort-button {
                color: white;
                background-color: #1C1F26;
                border: 1px solid white;
                margin-right: 10px;
                padding: 5px 10px;
                cursor: pointer;
            }
            
            .tile {
                display: inline-block;
                width: 200px;
                height: 350px; /* Ensure all tiles are the same height */
                margin: 10px;
                padding: 10px;
                border: 1px solid #ccc;
                border-radius: 8px;
                text-align: center;
                background-color: rgb(92, 92, 92); /* Set tile background to light grey */
                color: white; /* Set all text to white inside tiles */
                vertical-align: top;
            }
            
            .tile a {
                color: blue; /* Set link text to blue */
            }
            
            .tile button {
                color: black; /* Ensure button text is black */
            }
            
            .tile img {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
            }
            
            .product-name {
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .custom-modal-footer {
                display: flex;
                justify-content: space-between;
                padding-top: 10px;
            }
            
            #fullscreen-image {
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            #fullscreen-image img {
                max-width: 90%;
                max-height: 90%;
            }
            
            .image-container {
                height: 100px; /* Ensure there's space for the image/button */
            }
        `;
        document.head.appendChild(style);
    }

    // Function to create settings modal content
    function createSettingsModal() {

        const vineyardScanState = localStorage.getItem('vineyardScanState') === 'true';
        const vineyardScanText = vineyardScanState ? ' Vineyard Scan Stopped ' : 'Vineyard Scan Active';
    
        return `
            <div id="customSettingsModal" class="custom-modal-content">
                <div class="custom-modal-header">
                    <h2>Settings</h2>
                </div>
                <div class="custom-modal-body">
                    <button id="custom-update-link-button" class="custom-button custom-button-normal custom-button-toggle" role="button">
                        <span class="custom-button-inner">
                            <span class="custom-button-text">Update Sound Link</span>
                        </span>
                    </button>
                    <button id="custom-keyword-button" class="custom-button custom-button-normal custom-button-toggle" role="button">
                        <span class="custom-button-inner">
                            <span class="custom-button-text">Update Keywords</span>
                        </span>
                    </button>
                    <button id="custom-background-button" class="custom-button custom-button-normal custom-button-toggle" role="button">
                        <span class="custom-button-inner">
                            <span class="custom-button-text">Change Background</span>
                        </span>
                    </button>
                    <button id="show-scanned-items-button" class="custom-button custom-button-normal custom-button-toggle" role="button">
                        <span class="custom-button-inner">
                            <span class="custom-button-text">Show Scanned Items</span>
                        </span>
                    </button>
                    <button id="backup-restore-button" class="custom-button custom-button-normal custom-button-toggle" role="button">
                        <span class="custom-button-inner">
                        <span class="custom-button-text">Backup/Restore</span>
                    </span>
                </button>
                <button id="stop-vineyard-scan-button" class="custom-button custom-button-normal custom-button-toggle" role="button">
                    <span class="custom-button-inner">
                        <span class="custom-button-text">${vineyardScanText}</span>
                    </span>
                </button>
            </div>
            <div class="custom-modal-footer">
                    <button id="custom-modal-close-btn" class="custom-button custom-button-primary">
                        <span class="custom-button-inner">
                            <span class="custom-button-text">Done</span>
                        </span>
                    </button>
                </div>
            </div>
            <div id="scannedItemsModal" class="custom-modal-content">
                <div class="custom-modal-header">
                    <h2>Scanned Items</h2>
                    <input type="text" id="search-bar" placeholder="Search by Name or ASIN" oninput="filterItems()" />
                    <button onclick="sortItemsByName()">Sort by Name</button>
                    <button onclick="sortItemsByPrice()">Sort by Price</button>
                    <button onclick="sortByDate()">Sort by Date (Newest to Oldest)</button>
                </div>
                <div class="custom-modal-body" id="scanned-items-list"></div>
                <div class="custom-modal-footer">
                    <button id="prev-page-btn" class="custom-button custom-button-primary" onclick="prevPage()">Previous</button>
                    <button id="next-page-btn" class="custom-button custom-button-primary" onclick="nextPage()">Next</button>
                    <button id="scanned-modal-close-btn" class="custom-button custom-button-primary">
                        <span class="custom-button-inner">
                            <span class="custom-button-text">Close</span>
                        </span>
                    </button>
                </div>
            </div>
        `;
    }

    // Function to initialize the settings button and modal
    function initSettingsButton() {
        // Inject custom CSS
        injectCustomCSS();

        const resourcesTab = document.getElementById('vvp-resources-tab');
        if (resourcesTab) {
            resourcesTab.innerHTML = `<a href="https://www.amazon.com/vine/resources" role="tab" aria-selected="true">Wishlist</a>`;
        }    

        // Replace the logo with custom one
        const logoElement = document.querySelector('#vvp-logo-link img');
        if (logoElement) {
            logoElement.src = 'https://raw.githubusercontent.com/lIl-LolliKing-lIl/testing/main/cw1h5dy.webp';
            logoElement.height = 150; // Set the custom height
        }

        // Update the href attribute of the logo link and set it to open in a new tab
        const logoLink = document.getElementById('vvp-logo-link');
        if (logoLink) {
            logoLink.href = 'https://www.youtube.com/watch?v=WS_GWq5ZjMA'; // Replace with your desired URL
            logoLink.target = '_blank'; // Make the link open in a new tab
        }

        // Replace the feedback button with a settings button
        const feedbackButton = document.querySelector('#vvp-feedback-link');
        if (feedbackButton) {
            feedbackButton.innerHTML = `
                <span class="custom-declarative" id="custom-settings-link"><a href="javascript:void(0)" role="button" class="custom-popover-trigger">Vineyard Settings<i class="custom-icon custom-icon-popover"></i></a></span>
            `;
        }
        const footerimg = document.getElementsByClassName('navFooterMoreOnAmazon');
        if (footerimg.length > 0) {
            footerimg[0].innerHTML = '<img alt="lolified" src="https://raw.githubusercontent.com/lIl-LolliKing-lIl/testing/main/landscape.webp" height="150">';
        }

        const navFooterLine = document.querySelector('.navFooterLine.navFooterLinkLine.navFooterPadItemLine');
        if (navFooterLine) {
            navFooterLine.remove();
        }

        // Remove the second section
        const navFooterVerticalColumn = document.querySelector('.navFooterVerticalColumn.navAccessibility');
        if (navFooterVerticalColumn) {
            navFooterVerticalColumn.remove();
        }
        const amzhstanoy = document.querySelector('#rhf');
        if (amzhstanoy) {
            amzhstanoy.remove()
        }

        // Remove the third section
        const navFooterLineDiv = document.querySelector('.nav-footer-line');
        if (navFooterLineDiv) {
            navFooterLineDiv.remove();
        }

        const vineButtonSectionInSettings = document.querySelector('#vvp-account-settings .vvp-direct-child-inline-margin');
        if (vineButtonSectionInSettings) {
            console.log('Removing vineButtonSectionInSettings');
            vineButtonSectionInSettings.remove();
        } else {
            console.log('vineButtonSectionInSettings not found');
        }

        const revaluationMessage = document.querySelector('#vvp-evaluation-date-display');
        if (revaluationMessage) {
            revaluationMessage.remove();
        }

        // Select the elements by their ids
        var extraStatsDiv = document.getElementById("account-extra-stats");
        var kingstestDiv = document.querySelector("#vvp-current-status-box .a-box-inner > div");
        var newParentDiv = document.querySelector("#vvp-current-status-box .a-box-inner .a-row .a-column.a-span6.a-span-last"); // Adjusted to target the correct column

        // Move the element to the new parent
        if (extraStatsDiv && newParentDiv) {
            newParentDiv.appendChild(extraStatsDiv);
        }

        // Add the id 'kingstest' to the div
        if (kingstestDiv) {
            kingstestDiv.id = "kingstest";
        }


        // Function to add id to body
        function addIdToBody() {
            document.body.id = 'backimg';
        }

        // Call the function after the DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addIdToBody);
        } else {
            addIdToBody();
        }



        // Add the settings modal to the body
        document.body.insertAdjacentHTML('beforeend', createSettingsModal());

        // Event listener to close the settings modal
        document.getElementById('custom-modal-close-btn').addEventListener('click', function() {
            document.getElementById('customSettingsModal').style.display = 'none';
        });

        // Event listener to close the scanned items modal
        document.getElementById('scanned-modal-close-btn').addEventListener('click', function() {
            document.getElementById('scannedItemsModal').style.display = 'none';
        });

        // Add event listeners for the settings buttons here
        document.getElementById('custom-update-link-button').addEventListener('click', function() {
            updateScanSoundLink();
        });
        document.getElementById('custom-keyword-button').addEventListener('click', function() {
            updateKeywords();
        });
        document.getElementById('custom-background-button').addEventListener('click', function() {
            changeBackground();
        });

        document.getElementById('show-scanned-items-button').addEventListener('click', function() {
            showScannedItems();
        });
        document.getElementById('backup-restore-button').addEventListener('click', function() {
            showBackupRestoreDialog();
        });
        document.getElementById('stop-vineyard-scan-button').addEventListener('click', function() {
            toggleVineyardScan();
        });
    
        // Open the modal when the settings button is clicked
        feedbackButton.querySelector('a').addEventListener('click', function() {
            document.getElementById('customSettingsModal').style.display = 'block';
        });

        // Add event listener to close the modal when clicking outside of it
        document.addEventListener('click', function(event) {
            const modal = document.getElementById('customSettingsModal');
            if (modal.style.display === 'block' && !modal.contains(event.target) && !feedbackButton.contains(event.target)) {
                modal.style.display = 'none';
            }
        });
    }

    // Function to update scan sound link
    function updateScanSoundLink() {
        const currentLink = localStorage.getItem('scanSoundLink') || 'No link set';
        const newLink = prompt(`Enter the new link for the scan sound:`, currentLink);
        if (newLink !== null) {
            scanSoundLink = newLink;
            localStorage.setItem('scanSoundLink', scanSoundLink);
        }
    }

    // Function to update keywords
    function updateKeywords() {
        const newKeywords = prompt('Enter the keywords to monitor (separated by commas):', keywords.join(', '));
        if (newKeywords !== null) {
            keywords = newKeywords.split(', ').map(keyword => keyword.trim());
            localStorage.setItem('keywords', keywords.join(', '));
        }
    }

    function showCategorySort() {
        const categorySort = document.getElementById('category-sort');
        if (categorySort.style.display === 'none') {
            categorySort.style.display = 'block';
        } else {
            categorySort.style.display = 'none';
        }
    }

    // Function to change background image
    function changeBackground() {
        const currentBackground = localStorage.getItem('backgroundImage') || 'No base64 set';
        const originalUrl = localStorage.getItem('backgroundImageUrl') || '';
        const imageUrl = prompt('Enter the URL of the new background image:', originalUrl);

        if (imageUrl !== null) {
            if (imageUrl.trim() === '') {
                // If the URL field is left blank, remove the entries from localStorage
                localStorage.removeItem('backgroundImage');
                localStorage.removeItem('backgroundImageUrl');
                localStorage.removeItem('backgroundWidth');
                localStorage.removeItem('backgroundHeight');

                // Reset the background to the CSS one
                document.body.style.backgroundImage = '';
                document.body.style.backgroundSize = '';
                document.body.style.backgroundRepeat = '';
            } else {
                fetch(imageUrl)
                    .then(response => response.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const base64String = reader.result.replace('data:', '').replace(/^.+,/, '');
                            const base64Image = `data:image/jpg;base64,${base64String}`;

                            const width = prompt('Enter the width percentage or pixels (e.g., 100% or 1920px):', '100%');
                            const height = prompt('Enter the height percentage or pixels (e.g., 100% or 1080px):', '100%');

                            // Store the new base64 image and original URL in localStorage
                            localStorage.setItem('backgroundImage', base64Image);
                            localStorage.setItem('backgroundImageUrl', imageUrl);
                            localStorage.setItem('backgroundWidth', width);
                            localStorage.setItem('backgroundHeight', height);

                            // Apply the new background image
                            document.body.style.backgroundImage = `url(${base64Image})`;
                            document.body.style.backgroundSize = `${width} ${height}`;
                            document.body.style.backgroundRepeat = 'no-repeat';
                        };
                        reader.readAsDataURL(blob);
                    })
                    .catch(error => {
                        console.error('Error converting image to base64:', error);
                    });
            }
        }
    }


// Function to update the Vineyard Scan button text based on its state
function updateVineyardScanButton() {
    const vineyardScanState = localStorage.getItem('vineyardScanState') === 'true';
    const button = document.getElementById('stop-vineyard-scan-button');
    button.querySelector('.custom-button-text').textContent = vineyardScanState ? ' Vineyard Scan Stopped ' : 'Vineyard Scan Active';
}

// Function to toggle the Vineyard Scan state
function toggleVineyardScan() {
    let vineyardScanState = localStorage.getItem('vineyardScanState') === 'true';
    vineyardScanState = !vineyardScanState;
    localStorage.setItem('vineyardScanState', vineyardScanState);
    updateVineyardScanButton();
}

// Function to retrieve and display timestamps
function retrieveTimestamps() {
    const timestamps = [
        { id: 'vvp-join-vine-stamp', label: 'Joined Vine' },
        { id: 'vvp-eval-start-stamp', label: 'last Evaluation' },
        { id: 'vvp-eval-end-stamp', label: 'Next Evaluation' }
    ];

    let message = '';

    timestamps.forEach(ts => {
        const element = document.getElementById(ts.id);
        if (element) {
            const timestamp = parseInt(element.textContent);
            const date = new Date(timestamp);
            message += `${ts.label}: ${date.toLocaleString()}\n`;
        } else {
            message += `${ts.label}: Not found\n`;
        }
    });

    // Replace button with message
    const button = document.querySelector('.custom-button-primary');
    if (button) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'timestamp-message';
        messageDiv.innerText = message;
        button.parentNode.replaceChild(messageDiv, button);
    }
}
// Function to replace the specified span with a button for retrieveTimestamps function
function replaceSpanWithRetrieveTimestampsButton() {
    // Check if the account-extra-stats element is present
    const extraStatsDiv = document.getElementById("account-extra-stats");

    if (!extraStatsDiv) {
        // Locate the target div element
        const targetDiv = document.querySelector('.a-column.a-span6.a-span-last');
        
        if (targetDiv) {
            // Locate the target span element
            const targetSpan = targetDiv.querySelector('.a-declarative[data-action="a-popover"]');

            if (targetSpan) {
                // Create the new button element
                const newButton = document.createElement('button');
                newButton.className = 'custom-button custom-button-primary';
                newButton.innerHTML = '<span class="custom-button-inner"><span class="custom-button-text">Retrieve Timestamps</span></span>';
                
                // Add event listener to call retrieveTimestamps function when button is clicked
                newButton.addEventListener('click', retrieveTimestamps);

                // Replace the target span with the new button
                targetDiv.replaceChild(newButton, targetSpan);
            } else {
                console.error('Error: Target span not found');
            }
        } else {
            console.error('Error: Target div not found');
        }
    } else {
        console.log('Account extra stats element is present, not injecting the button.');
    }
}

// Call the function after the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceSpanWithRetrieveTimestampsButton);
} else {
    replaceSpanWithRetrieveTimestampsButton();
}


    // Function to show the Backup/Restore dialog
    async function showBackupRestoreDialog() {
        const action = prompt('Enter 1 to Backup or 2 to Restore:');
        if (action === '1') {
            await backupData();
        } else if (action === '2') {
            restoreData();
        } else {
            alert('Invalid input. Please enter 1 for Backup or 2 for Restore.');
        }
    }

    // Function to backup data
    async function backupData() {
        // Retrieve all settings from localStorage
        const settings = {
            keywords: localStorage.getItem('keywords'),
            scanSoundLink: localStorage.getItem('scanSoundLink'),
            backgroundImage: localStorage.getItem('backgroundImage'),
            backgroundWidth: localStorage.getItem('backgroundWidth'),
            backgroundHeight: localStorage.getItem('backgroundHeight'),
        };

        // Retrieve all items from IndexedDB
        const db = await openDB('vineyard', 6);
        const items = await db.getAll('items');

        // Create a backup object
        const backup = {
            settings,
            items
        };

        // Convert backup object to JSON string
        const backupJson = JSON.stringify(backup);

        // Create a Blob from the JSON string
        const blob = new Blob([backupJson], { type: 'application/json' });

        // Create a compressed file (ZIP) using JSZip
        const zip = new JSZip();
        zip.file('backup.json', blob);

        // Generate the ZIP file and trigger the download
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = 'backup.zip';
        link.click();
    }

    // Function to restore data
    function restoreData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';

        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (file) {
                const zip = new JSZip();
                const zipContent = await zip.loadAsync(file);
                const backupFile = zipContent.file('backup.json');
                const backupJson = await backupFile.async('string');
                const backup = JSON.parse(backupJson);

                console.log('Restoring settings and items from backup:', backup);

                // Restore settings to localStorage
                for (const key in backup.settings) {
                    localStorage.setItem(key, backup.settings[key]);
                }

                // Restore items to IndexedDB
                const db = await openDB('vineyard', 6);
                const tx = db.transaction('items', 'readwrite');
                for (const item of backup.items) {
                    tx.store.put(item);
                }
                await tx.done;

                alert('Data restored successfully!');
            }
        };

        input.click();
    }


/////////////////////////////////////////////////////////////////////////////////////////////////////////////




// Function to initialize extra settings
function initExtraSettings() {
    const extraSettingsHTML = `
        <div id="extra-settings">
            <h3>Extra Settings</h3>
            <label><input type="checkbox" id="removeTopNavBar"> Remove Top Nav Bar</label>
            <label><input type="checkbox" id="addnavtosearch"> Add navigation to search pages</label>
            <label>
                Choose Bookmark Style:
                <select id="bookmarkStyle">
                    <option value="none">None</option>
                    <option value="pagination">Pagination</option>
                    <option value="topBar">Top Bar</option>
                </select>
            </label>
            <div class="settings-section" id="even-more-settings">
                <h3>Even More Settings</h3>
                <div class="setting-item">
                    <label>Custom Pointer:
                        <select id="custom-pointer">
                            <option value="none">None</option>
                            <option value="AmericanFlagPointer">American Flag</option>
                            <option value="MinecraftSwordPointer">Minecraft Sword</option>
                        </select>
                    </label>
                </div>
            </div>
        </div>
    `;

    // Insert the extra settings into the settings modal
    const settingsModalBody = document.querySelector('#customSettingsModal .custom-modal-body');
    settingsModalBody.insertAdjacentHTML('beforeend', extraSettingsHTML);

    // Function to remove custom pointer styles
    function removeCustomPointer() {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = `
            * {
                cursor: unset !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Function to apply the custom pointer
    let customPointer = null;

    function applyCustomPointer(pointer) {
        // Remove any existing custom pointer styles
        removeCustomPointer();

        switch (pointer) {
            case 'MinecraftSwordPointer':
                // Example code for applying Minecraft Sword pointer
                customPointer = new MinecraftSwordPointer();
                break;
            case 'AmericanFlagPointer':
                // Example code for applying American Flag pointer
                customPointer = new AmericanFlagPointer();
                break;
            case 'none':
            default:
                customPointer = null;
                break;
        }
    }

    // Function to remove top navigation bar
    function removeTopNavBar() {
        const navBar = document.getElementById('navbar-main');
        if (navBar) {
            navBar.style.display = 'none';
        }

        const skipLink = document.getElementById('skiplink');
        if (skipLink) {
            skipLink.style.display = 'none';
        }
    }

    // Function to restore top navigation bar
    function restoreTopNavBar() {
        const navBar = document.getElementById('navbar-main');
        if (navBar) {
            navBar.style.display = '';
        }

        const skipLink = document.getElementById('skiplink');
        if (skipLink) {
            skipLink.style.display = '';
        }
    }

    // Function to replace <br> element with new content
    function replacebrwithnav() {
        const searchInput = document.getElementById('vvp-search-text-input');
        if (searchInput && searchInput.value.trim() !== '') {
            const brElement = document.querySelector('#vvp-items-button-container > br');
            if (brElement) {
                const newContent = `
                    <span id="vvp-items-button--recommended" class="a-button a-button-normal a-button-toggle">
                        <span class="a-button-inner">
                            <a href="vine-items?queue=potluck" role="radio" aria-checked="false" class="a-button-text">Recommended for you</a>
                        </span>
                    </span>
                    <span id="vvp-items-button--all" class="a-button a-button-normal a-button-toggle">
                        <span class="a-button-inner">
                            <a href="vine-items?queue=last_chance" role="radio" aria-checked="true" class="a-button-text">Available for all</a>
                        </span>
                    </span>
                    <span id="vvp-items-button--seller" class="a-button a-button-normal a-button-toggle">
                        <span class="a-button-inner">
                            <a href="vine-items?queue=encore" role="radio" aria-checked="true" class="a-button-text">Additional items</a>
                        </span>
                    </span>
                `;
                brElement.insertAdjacentHTML('beforebegin', newContent);
                brElement.remove();
            }
        }
    }

    // Function to restore <br> element
    function restoreBrElement() {
        const searchInput = document.getElementById('vvp-search-text-input');
        if (searchInput && searchInput.value.trim() !== '') {
            const container = document.getElementById('vvp-items-button-container');
            if (container) {
                container.innerHTML = '<br>';
            }
        }
    }

    // Function to add saved search buttons for pagination
    function addSavedSearchButtonsPagination() {
        const navigationContainer = document.querySelector('.a-text-center[role="navigation"]');
        if (navigationContainer) {
            let searchButtonsContainer = document.getElementById('search-buttons-container');
            if (searchButtonsContainer) {
                searchButtonsContainer.remove();
            }

            searchButtonsContainer = document.createElement('div');
            searchButtonsContainer.id = 'search-buttons-container';

            const searchInput = document.getElementById('vvp-search-text-input');

            if (searchInput && searchInput.value.trim() !== '') {
                let savedSearches = localStorage.getItem('savedSearches');
                savedSearches = savedSearches ? JSON.parse(savedSearches) : [];

                if (!savedSearches.some(search => search.title === searchInput.value.trim())) {
                    const saveSearchButton = document.createElement('span');
                    saveSearchButton.className = 'a-declarative';
                    saveSearchButton.id = 'save-search-btn';
                    saveSearchButton.innerHTML = `
                        <span class="a-button a-button-search">
                            <span class="a-button-inner">
                                <input class="a-button-input" type="submit" aria-labelledby="save-search">
                                <span class="a-button-text" aria-hidden="true">Save Search</span>
                            </span>
                        </span>
                    `;
                    saveSearchButton.addEventListener('click', saveSearch);
                    searchButtonsContainer.appendChild(saveSearchButton);
                }
            }

            let savedSearches = localStorage.getItem('savedSearches');
            savedSearches = savedSearches ? JSON.parse(savedSearches) : [];

            savedSearches.forEach(search => {
                const searchButton = document.createElement('span');
                searchButton.className = 'a-declarative';
                searchButton.id = 'srch-btns';
                searchButton.innerHTML = `
                    <span class="a-button a-button-search">
                        <span class="a-button-inner">
                            <input class="a-button-input" type="submit" aria-labelledby="${search.title}">
                            <span class="a-button-text" aria-hidden="true">${search.title}</span>
                        </span>
                    </span>
                    <span id="rmv-srch-pag" class="a-button a-button-normal a-button-toggle" title="Remove search">
                        <span class="a-button-inner" id="rmv-inner">
                            <a class="a-button-text" id="rmv-text">❌</a>
                        </span>
                    </span>
                `;

                searchButton.querySelector('#rmv-srch-pag').addEventListener('click', (event) => {
                    event.stopPropagation();
                    removeSearch(search.title);
                });

                searchButton.addEventListener('click', () => {
                    window.location.href = search.link;
                });

                searchButtonsContainer.appendChild(searchButton);
            });

            navigationContainer.appendChild(searchButtonsContainer);
        } else {
            console.log("Navigation container not found");
        }
    }

    // Function to add saved search buttons for top bar
    function addSavedSearchButtonsTopBar() {
        const navigationContainer = document.querySelector('.a-tabs.a-declarative');
        if (navigationContainer) {
            let searchButtonsContainer = document.getElementById('search-buttons-container');
            if (searchButtonsContainer) {
                searchButtonsContainer.remove();
            }

            searchButtonsContainer = document.createElement('ul');
            searchButtonsContainer.id = 'search-buttons-container';
            searchButtonsContainer.className = 'a-tabs a-declarative';

            const searchInput = document.getElementById('vvp-search-text-input');

            if (searchInput && searchInput.value.trim() !== '') {
                let savedSearches = localStorage.getItem('savedSearches');
                savedSearches = savedSearches ? JSON.parse(savedSearches) : [];

                if (!savedSearches.some(search => search.title === searchInput.value.trim())) {
                    const saveSearchButton = document.createElement('li');
                    saveSearchButton.className = 'a-tab-heading';
                    saveSearchButton.id = 'save-search-btn';
                    saveSearchButton.innerHTML = `
                        <a href="#" role="tab" aria-selected="false" tabindex="-1">
                            Save Search
                        </a>
                    `;
                    saveSearchButton.addEventListener('click', saveSearch);
                    searchButtonsContainer.appendChild(saveSearchButton);
                }
            }

            let savedSearches = localStorage.getItem('savedSearches');
            savedSearches = savedSearches ? JSON.parse(savedSearches) : [];

            savedSearches.forEach(search => {
                const searchButton = document.createElement('li');
                searchButton.className = 'a-tab-heading';
                searchButton.id = 'srch-btns';
                searchButton.innerHTML = `
                    <a href="${search.link}" role="tab" aria-selected="false" tabindex="-1">
                        ${search.title}
                    </a>
                    <span id="rmv-srch" class="a-button a-button-normal a-button-toggle" title="Remove search" style="cursor: pointer; margin-left: 10px;">
                        ❌
                    </span>
                `;

                searchButton.querySelector('#rmv-srch').addEventListener('click', (event) => {
                    event.stopPropagation();
                    removeSearch(search.title);
                });

                searchButtonsContainer.appendChild(searchButton);
            });

            navigationContainer.parentNode.insertBefore(searchButtonsContainer, navigationContainer.nextSibling);
        } else {
            console.log("Navigation container not found");
        }
    }

    function saveSearch() {
        const searchInput = document.getElementById('vvp-search-text-input');
        if (searchInput && searchInput.value.trim() !== '') {
            const searchTitle = searchInput.value;
            const searchLink = window.location.href;
            let savedSearches = localStorage.getItem('savedSearches');
            savedSearches = savedSearches ? JSON.parse(savedSearches) : [];
            if (!savedSearches.some(search => search.title === searchTitle)) {
                savedSearches.push({ title: searchTitle, link: searchLink });
                localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
                if (localStorage.getItem('bookmarkStyle') === 'pagination') {
                    addSavedSearchButtonsPagination(); // Refresh the buttons for pagination
                } else if (localStorage.getItem('bookmarkStyle') === 'topBar') {
                    addSavedSearchButtonsTopBar(); // Refresh the buttons for top bar
                }
            } else {
                console.log("Search already saved");
            }
        } else {
            console.log("Search input not found or empty");
        }
    }

    function removeSearch(title) {
        let savedSearches = localStorage.getItem('savedSearches');
        if (savedSearches) {
            savedSearches = JSON.parse(savedSearches);
            const updatedSearches = savedSearches.filter(search => search.title !== title);
            localStorage.setItem('savedSearches', JSON.stringify(updatedSearches));
            if (localStorage.getItem('bookmarkStyle') === 'pagination') {
                addSavedSearchButtonsPagination(); // Refresh the buttons for pagination
            } else if (localStorage.getItem('bookmarkStyle') === 'topBar') {
                addSavedSearchButtonsTopBar(); // Refresh the buttons for top bar
            }
        }
    }

    // Event listeners for the new Extra Settings options
    document.getElementById('removeTopNavBar').addEventListener('change', function() {
        if (this.checked) {
            localStorage.setItem('removeTopNavBar', 'true');
            removeTopNavBar();
        } else {
            localStorage.setItem('removeTopNavBar', 'false');
            restoreTopNavBar();
        }
    });

    document.getElementById('addnavtosearch').addEventListener('change', function() {
        if (this.checked) {
            localStorage.setItem('addnavtosearch', 'true');
            replacebrwithnav();
        } else {
            localStorage.setItem('addnavtosearch', 'false');
            restoreBrElement();
        }
    });

    document.getElementById('bookmarkStyle').addEventListener('change', function() {
        const selectedOption = this.value;
        localStorage.setItem('bookmarkStyle', selectedOption);
        if (selectedOption === 'pagination') {
            addSavedSearchButtonsPagination();
        } else if (selectedOption === 'topBar') {
            addSavedSearchButtonsTopBar();
        } else if (selectedOption === 'none') {
            const searchButtonsContainer = document.getElementById('search-buttons-container');
            if (searchButtonsContainer) {
                searchButtonsContainer.remove();
            }
        }
    });

    // Event listener for the custom pointer select element
    document.getElementById('custom-pointer').addEventListener('change', function() {
        const selectedPointer = this.value;
        localStorage.setItem('customPointer', selectedPointer);
        applyCustomPointer(selectedPointer);
    });

    // Apply settings on load
    if (localStorage.getItem('removeTopNavBar') === 'true') {
        document.getElementById('removeTopNavBar').checked = true;
        removeTopNavBar();
    }
    if (localStorage.getItem('addnavtosearch') === 'true') {
        document.getElementById('addnavtosearch').checked = true;
        replacebrwithnav();
    }
    const savedOption = localStorage.getItem('bookmarkStyle');
    if (savedOption) {
        document.getElementById('bookmarkStyle').value = savedOption;
        if (savedOption === 'pagination') {
            addSavedSearchButtonsPagination();
        } else if (savedOption === 'topBar') {
            addSavedSearchButtonsTopBar();
        }
    }
    const savedPointer = localStorage.getItem('customPointer');
    if (savedPointer) {
        document.getElementById('custom-pointer').value = savedPointer;
        applyCustomPointer(savedPointer);
    }
}

// Function to apply saved background image on page load
function applySavedBackground() {
    const savedBackground = localStorage.getItem('backgroundImage');
    const savedWidth = localStorage.getItem('backgroundWidth') || '100%';
    const savedHeight = localStorage.getItem('backgroundHeight') || '100%';
    if (savedBackground) {
        document.body.style.backgroundImage = `url(${savedBackground})`;
        document.body.style.backgroundSize = `${savedWidth} ${savedHeight}`;
        document.body.style.backgroundRepeat = 'no-repeat';
    } else {
        // Use the default CSS background if no saved background is found
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundRepeat = '';
    }
}

// Initialize the settings button when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initSettingsButton();
        applySavedBackground();
        initExtraSettings(); // Initialize the extra settings
    });
} else {
    initSettingsButton();
    applySavedBackground();
    initExtraSettings(); // Initialize the extra settings
}



})();






///////////////////////////////////////////////////////////////////////////////////////////////////////////








// Function to inject custom CSS for preferences modal and other elements
function injectPrefsCSS() {
    const style = document.createElement('style');
    style.innerHTML = `
        #prefsModal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            background-color: #1C1F26;
            color: white;
            box-shadow: 0px 0px 10px rgba(255, 255, 255, 0.5);
            border-radius: 8px;
            padding: 20px;
        }

        #prefsModal h2 {
            margin-top: 0;
            font-size: 1.5em;
        }

        #prefsModal label {
            display: block;
            margin: 10px 0;
        }

        #prefsModal input[type="checkbox"] {
            margin-right: 10px;
        }

        #prefsModal .custom-button {
            display: inline-block;
            padding: 10px 20px;
            margin: 10px 0;
            font-size: 14px;
            color: #333;
            background-color: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
        }

        #prefsModal .custom-button:hover {
            background-color: #e0e0e0;
        }

        #prefsModal .custom-button-primary {
            background-color: #ff9900;
            color: white;
            border: 1px solid #ff9900;
        }

        #prefsModal .custom-button-primary:hover {
            background-color: #e68a00;
        }

        .vineyard-get-etv-link {
            border-top-right-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
            cursor: pointer;
            filter: saturate(50%);
        }

        .vineyard-get-etv-link .a-button-inner {
            height: auto !important;
        }

        .vvp-item-tile .a-button-text {
            padding: 5px 2px;
        }

        .vvp-item-tile-content {
            position: relative;
        }
        
        .vineyard-etv-display {
            position: absolute;
            right: 16.5%;
            bottom: 55px;
            width: auto !important;
            font-size: 12px;
            margin: 0 !important;
        }

        .vineyard-fix-asin-link {
            border-top-right-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
            cursor: pointer;
            filter: saturate(50%);
        }

        .vineyard-fix-asin-link .a-button-inner {
            height: auto !important;
        }

        #vvp-browse-nodes-container {
            align-self: start;
            position: sticky;
            top: 0;
        }

        #vvp-items-grid-container > [role="navigation"] {
            position: sticky;
            bottom: 0;
            padding-top: 5px;
            background-color: #1C1F26;
            border-top: 1px solid #ccc;
            z-index: 30;
        }

        .vvp-details-btn{
            width: 55% !important;
        }

        .vvp-item-tile-content .a-button:not(.vvp-details-btn, :last-child) {
            border-radius: 0;
        }

        .vvp-item-tile-content .a-button:not(.vvp-details-btn) {
            height: auto !important;
            padding: 0;
            border-radius: 8px !important;
        }
        
        .vvp-item-tile-content .a-button .a-button-text{
            padding:0;
        }

        .vvp-item-tile-content .a-button.a-button-span2 {
            width: 44px !important;
        }

        .vineyard-get-etv-link.a-button-disabled, .vineyard-get-etv-link.a-button-disabled .a-button-text{
            cursor: not-allowed !important;
            filter: saturate(50%);
            background-color: #75667b !important;
        }
        
        .vineyard-etv-display{
            font-size: 12px;
            margin: 0 !important;
        }
        .vineyard-get-etv-link.a-button-disabled, 
        .vineyard-get-etv-link.a-button-disabled .a-button-inner {
            background-color: #75667b !important
            color: #000000 !important;
            cursor: not-allowed !important;
            border: 0px solid #99ccdc00 !important;
            box-shadow: rgb(46 62 208) 0px 0px 3px 2px !important;
        }
        
        .vineyard-get-etv-link.a-button-disabled .a-button-text {
            padding: 0 !important;
        }
        
        .vineyard-get-etv-link.a-button-disabled:hover {
            background-color: #ADD8E6 !important; /* Ensure background color stays the same on hover */
            filter: none !important;
        }
        

    `;
    document.head.appendChild(style);
}


// Function to create the preferences modal content
function createPrefsModal() {
    const vhContainerExists = document.getElementById('vh-notifications-container') !== null;

    return `
        <div id="prefsModal">
            <h2>Preferences</h2>
            <label><input type="checkbox" id="stickySidebar"> Sticky Sidebar</label>
            <label><input type="checkbox" id="stickyPagination"> Sticky Pagination</label>
            <label><input type="checkbox" id="addEtvButton"> Add "Get ETV" button to the UI</label>
            <label><input type="checkbox" id="fixSpinnerButton"> Add "fix infinite spinner" button to the UI</label>
            ${vhContainerExists ? '<label><input type="checkbox" id="removevhcontainer"> Hide vine helper container</label>' : ''}
            <button id="prefsDoneBtn" class="custom-button custom-button-primary">Done</button>
        </div>
    `;
}

// Function to initialize the preferences button and modal
function initPrefsButton() {
    injectPrefsCSS();
    document.body.insertAdjacentHTML('beforeend', createPrefsModal());

    const prefsButtonHTML = `
        <span id="prefs-button" class="a-button a-button-normal a-button-toggle" role="button">
            <span class="a-button-inner">
                <a class="a-button-text">Prefs</a>
            </span>
        </span>
    `;
    const searchBox = document.getElementById('vvp-search-text-input');
    if (searchBox) {
        searchBox.parentNode.insertBefore(document.createRange().createContextualFragment(prefsButtonHTML), searchBox);
    }

    document.getElementById('prefs-button').addEventListener('click', () => {
        document.getElementById('prefsModal').style.display = 'block';
    });

    document.getElementById('prefsDoneBtn').addEventListener('click', () => {
        document.getElementById('prefsModal').style.display = 'none';
        savePrefs();
    });
    

    loadPrefs();
    applyPrefs();
}

//s

// Function to load preferences from localStorage
function loadPrefs() {
    ['stickySidebar', 'stickyPagination', 'addEtvButton', 'fixSpinnerButton', 'removevhcontainer'].forEach(pref => {
        if (document.getElementById(pref)) {
            document.getElementById(pref).checked = localStorage.getItem(pref) === 'true';
        }
    });
}


// Function to save preferences to localStorage
function savePrefs() {
    ['stickySidebar', 'stickyPagination', 'addEtvButton', 'fixSpinnerButton', 'removevhcontainer'].forEach(pref => {
        if (document.getElementById(pref)) {
            localStorage.setItem(pref, document.getElementById(pref).checked);
        }
    });
    applyPrefs();
}


// Function to apply preferences immediately
function applyPrefs() {
    const prefs = {
        stickySidebar: localStorage.getItem('stickySidebar') === 'true',
        stickyPagination: localStorage.getItem('stickyPagination') === 'true',
        addEtvButton: localStorage.getItem('addEtvButton') === 'true',
        fixSpinnerButton: localStorage.getItem('fixSpinnerButton') === 'true',
        removevhcontainer: localStorage.getItem('removevhcontainer') === 'true',
    };

    const sidebar = document.getElementById('vvp-browse-nodes-container');
    if (sidebar) {
        sidebar.style.position = prefs.stickySidebar ? 'sticky' : 'relative';
        sidebar.style.top = prefs.stickySidebar ? '0' : '';
    }

    const vhcontainer = document.getElementById('vh-notifications-container');
    if(vhcontainer) {
        vhcontainer.style.height = prefs.removevhcontainer ? '0' : 'auto';
    }
    
    //just leaving this to remember how to remove elements wiht this menu
    //const feedmenu = document.getElementById('id-here');
    //if (feedmenu && prefs.removevhcontainer) {
    //    feedmenu.remove();
    //}

    const pagination = document.querySelector('#vvp-items-grid-container > [role="navigation"]');
    if (pagination) {
        pagination.style.position = prefs.stickyPagination ? 'sticky' : 'relative';
        pagination.style.bottom = prefs.stickyPagination ? '0' : '';
        pagination.style.backgroundColor = prefs.stickyPagination ? '#1C1F26' : '';
    }

    document.querySelectorAll('.vvp-item-tile-content').forEach(tileContentEl => {
        handleETVButton(tileContentEl, prefs.addEtvButton);
        handleFixSpinnerButton(tileContentEl, prefs.fixSpinnerButton);
    });
}

function handleETVButton(tileContentEl, addEtvButton) {
    const etvLinkClass = 'vineyard-get-etv-link';
    const etvDisplayClass = 'vineyard-etv-display';

    // Extract the isParent value from the input element
    const inputEl = tileContentEl.querySelector("input.a-button-input");
    
    if (!inputEl) {
        console.warn('Input element not found:', tileContentEl);
        return;
    }

    const isParent = /true/i.test(inputEl.getAttribute("data-is-parent-asin"));

    if (addEtvButton && !tileContentEl.querySelector(`.${etvLinkClass}`)) {
        const getEtvLink = document.createElement("button");
        getEtvLink.type = "button";
        getEtvLink.className = `${etvLinkClass} a-button a-button-primary a-button-span2`;
        getEtvLink.innerHTML = `<span class='a-button-inner'><span class='a-button-text'>💵</span></span>`;

        if (isParent) {
            getEtvLink.title = "Has variations, see the details";
            getEtvLink.classList.remove("a-button-primary");
            getEtvLink.classList.add("a-button-disabled");
            getEtvLink.setAttribute("disabled", "");
        } else {
            getEtvLink.title = "Get ETV";
            
            const etvLinkClickFn = async (ev) => {
                ev.preventDefault();

                // Disable the button after click to prevent multiple clicks
                getEtvLink.classList.remove("a-button-primary");
                getEtvLink.classList.add("a-button-disabled");
                getEtvLink.setAttribute("disabled", "");
                getEtvLink.removeEventListener("click", etvLinkClickFn);

                const etvDisplayEl = document.createElement("div");
                etvDisplayEl.className = etvDisplayClass;
                etvDisplayEl.innerText = "loading...";
                tileContentEl.insertBefore(etvDisplayEl, tileContentEl.firstChild);

                const recommendationId = encodeURIComponent(inputEl.getAttribute("data-recommendation-id"));
                const asin = inputEl.getAttribute("data-asin");
                const url = `${location.origin}/vine/api/recommendations/${recommendationId}/item/${asin}?imageSize=180`;
                try {
                    const req = await fetch(url);
                    const response = await req.json();
                    const data = response.result;

                    if (data) {
                        const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: data.taxCurrency });
                        etvDisplayEl.innerText = `ETV: ${currencyFormatter.format(data.taxValue)}`;
                    } else {
                        etvDisplayEl.innerText = "Error getting ETV!";
                    }
                } catch (error) {
                    etvDisplayEl.innerText = "Error getting ETV!";
                    console.error("Failed to fetch ETV data", error);
                }

                // Remove focus from the element so keyboard navigation can easily resume
                document.activeElement.blur();
            };

            getEtvLink.addEventListener("click", etvLinkClickFn);
        }

        tileContentEl.append(getEtvLink);
    } else if (!addEtvButton) {
        const etvLink = tileContentEl.querySelector(`.${etvLinkClass}`);
        if (etvLink) {
            etvLink.remove();
        }
    }
}



// Function to handle fix spinner button
function handleFixSpinnerButton(tileContentEl, fixSpinnerButton) {
    if (fixSpinnerButton && !tileContentEl.querySelector('.vineyard-fix-asin-link')) {
        const fixLink = document.createElement("button");
        fixLink.type = "button";
        fixLink.className = "vineyard-fix-asin-link a-button a-button-primary a-button-span2";
        fixLink.innerHTML = `<span class='a-button-inner'><span class='a-button-text'>🔃</span></span>`;
        fixLink.title = "Fix infinite spinner error";
        fixLink.addEventListener("click", (ev) => {
            ev.preventDefault();
            const newASIN = prompt("Open the product page, copy the ASIN number, and put it here...");
            if (newASIN !== "") {
                const inputEl = tileContentEl.querySelector("input.a-button-input");
                inputEl.setAttribute("data-is-parent-asin", "false");
                inputEl.setAttribute("data-asin", newASIN);
                inputEl.focus();
            }
        });
        tileContentEl.append(fixLink);
    } else if (!fixSpinnerButton) {
        const fixLink = tileContentEl.querySelector('.vineyard-fix-asin-link');
        if (fixLink) {
            fixLink.remove();
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (document.getElementById('vvp-search-text-input')) {
            initPrefsButton();
        } else {
            document.addEventListener('DOMContentLoaded', initPrefsButton);
        }
    });
} else {
    if (document.getElementById('vvp-search-text-input')) {
        initPrefsButton();
    }
}


// Pagination when left/right arrow keys are pressed =======================
document.body.addEventListener("keyup", (ev) => {
    if (document.activeElement.tagName.toLowerCase() !== "input") {
      // Only do this if you are not currently in an input field
      if (ev.key === "ArrowLeft") {
        const el = document.querySelector(".a-pagination li:first-child a");
        el.focus();
        el.click();
      } else if (ev.key === "ArrowRight") {
        const el = document.querySelector(".a-pagination li:last-child a");
        el.focus();
        el.click();
      }
    }
  });
  

// This script overrides the global error handler and specific logging functions with safe defaults

(function() {
    window.onerror = null; // Disable the global error handler
    window.ueLogError = function() {}; // Override the ueLogError function

    // Optionally, override other specific functions used by the script
    window.ue_csm = {
        log: function() {},
        err: {
            log: function() {}
        }
    };

    // Provide safe defaults for any other functions that might be called
    window.ue = window.ue || {};
    window.ue.attach = window.ue.attach || function() {};
    window.ue.log = window.ue.log || function() {};

    // If b is used in the script, make sure it has the necessary functions
    var b = window.ue;
    b.attach = b.attach || function() {};
})();
// Function to get the number from the second-to-last <li> element in the pagination
function getSecondToLastPaginationNumber() {
    const paginationItems = document.querySelectorAll('.a-pagination li');
    if (paginationItems.length >= 2) {
        const secondToLastItem = paginationItems[paginationItems.length - 2]; // Second-to-last element
        const linkElement = secondToLastItem.querySelector('a');
        if (linkElement) {
            return parseInt(linkElement.textContent.trim(), 10);
        }
    }
    return null; // Return null if the second-to-last element or its link is not found
}

// Function to create and add the Random button
function addRandomButton() {
    const paginationContainer = document.querySelector('.a-pagination');
    
    if (!paginationContainer) {
        console.log("Pagination container not found");
        return;
    }

    const previousButtonLi = Array.from(paginationContainer.querySelectorAll('li')).find(li => {
        const span = li.querySelector('span.vh-pagination-previous');
        const link = li.querySelector('a');
        return (span && span.textContent.includes('Previous')) || (link && link.textContent.includes('Previous'));
    });

    // Check if the Random button already exists to avoid duplicates
    const existingRandomButton = paginationContainer.querySelector('li a[href="javascript:void(0)"]');
    if (existingRandomButton) {
        existingRandomButton.parentElement.remove();
    }

    // Create the Random button
    const randomButton = document.createElement('li');
    randomButton.className = 'a-normal';
    const randomButtonLink = document.createElement('a');
    randomButtonLink.href = 'javascript:void(0)';
    randomButtonLink.textContent = 'Random';
    randomButton.appendChild(randomButtonLink);

    // Insert the Random button before the Previous button or at the beginning if not found
    if (previousButtonLi) {
        previousButtonLi.insertAdjacentElement('beforebegin', randomButton);
    } else {
        paginationContainer.insertAdjacentElement('afterbegin', randomButton);
    }

    // Add click event listener to the Random button
    randomButtonLink.addEventListener('click', function() {
        const maxNumber = getSecondToLastPaginationNumber();
        if (maxNumber) {
            const randomPage = Math.floor(Math.random() * maxNumber) + 1;
            const randomPageLink = `/vine/vine-items?queue=encore&pn=&cn=&page=${randomPage}`;
            window.location.href = randomPageLink;
        } else {
            alert('Could not retrieve the maximum page number.');
        }
    });
}

// Function to ensure the Random button is added on page load
function ensureRandomButton() {
    addRandomButton();
}

// Ensure the Random button is added
ensureRandomButton();


(function() {
    // Function to move the elements
    function moveElements() {
        const variationsContainer = document.getElementById('vvp-product-details-modal--variations-container');
        const taxValue = document.getElementById('vvp-product-details-modal--tax-value');
        const targetContainer = document.querySelector('.vvp-modal-footer');

        if (variationsContainer && taxValue && targetContainer) {
            // Move the elements inside the target container
            targetContainer.insertBefore(variationsContainer, targetContainer.firstChild);
            targetContainer.insertBefore(taxValue, variationsContainer.nextSibling);
        } else {
            console.log('One or more elements were not found.');
        }
    }

    // Add event listener to the "See details" button
    document.addEventListener('click', function(event) {
        const seeDetailsButton = event.target.closest('.vvp-details-btn');
        if (seeDetailsButton) {
            // Use setTimeout to wait for the elements to be added to the DOM
            setTimeout(moveElements, 500); // Adjust the delay if necessary
        }
    });
})();

function initMoreExtraSettings() {
    const moreExtraSettingsHTML = `
        <div id="more-extra-settings">
            <h3>More Extra Settings</h3>
            <label>
                Font Size (in pixels):
                <input type="number" id="fontSizeInput" value="16" min="10" max="100">
            </label>
            <label><input type="checkbox" id="hoverCSSInjection"> Enable Hover Zoom CSS</label>
            <label>
                Cursor Effect:
                <select id="cursorEffectSelector">
                    <option value="">None</option>
                    <option value="fairyDustCursor">Fairy Dust</option>
                    <option value="emojiCursor">Emoji Rain</option>
                    <option value="springyEmojiCursor">Springy Emoji</option>
                    <option value="ghostCursor">Ghost Following</option>
                    <option value="trailingCursor">Trailing Cursor</option>
                    <option value="textFlag">Text Flag</option>
                    <option value="followingDotCursor">Following Dot</option>
                    <option value="bubbleCursor">Bubble</option>
                    <option value="snowflakeCursor">Snowflake</option>
                    <option value="rainbowCursor">Rainbow</option>
                    <option value="clockCursor">Clock</option>
                    <option value="characterCursor">Character</option>
                    <option value="starFadeCursor">Star Fade</option>
                </select>
            </label>
            <div id="cursorCustomization" style="display: none;">
                <h4>Customize Cursor</h4>
                <div id="customizationInputs"></div>
                <button id="applyCustomization">Apply Customization</button>
            </div>
        </div>
    `;

    const settingsModalBody = document.querySelector('#customSettingsModal .custom-modal-body');
    settingsModalBody.insertAdjacentHTML('beforeend', moreExtraSettingsHTML);

    function changeFontSize(size) {
        document.body.style.fontSize = size + 'px';
    }

    function injectHoverCSS() {
        const hoverCSS = `
            #vvp-items-grid-container .vvp-item-tile:hover img {
                width: var(--zoom-height, 400px) !important;
                position: fixed !important;
                z-index: 2 !important;
                left: 45%;
                top: 30% !important;
                border: 1px solid black !important;
                text-align: center;
                background-color: white;
                pointer-events: none;
            }

            #vvp-items-grid-container .vvp-item-tile:hover .vvp-item-product-title-container {
                border-top: calc(var(--grid-column-width, 200px) + 0.5rem) solid transparent !important;
                height: calc(var(--item-tile-height, 40px) + calc(var(--grid-column-width, 110px) + 0.5rem)) !important;
            }

            #vvp-items-grid-container .vvp-item-tile:hover img {
                opacity: 100%;
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.type = "text/css";
        styleSheet.id = "hoverZoomCSS";
        styleSheet.innerText = hoverCSS;
        document.head.appendChild(styleSheet);
    }

    function removeHoverCSS() {
        const hoverCSS = document.getElementById('hoverZoomCSS');
        if (hoverCSS) {
            hoverCSS.remove();
        }
    }

    document.getElementById('fontSizeInput').addEventListener('change', function() {
        const fontSize = this.value;
        localStorage.setItem('fontSize', fontSize);
        changeFontSize(fontSize);
    });

    document.getElementById('hoverCSSInjection').addEventListener('change', function() {
        if (this.checked) {
            localStorage.setItem('hoverCSSInjection', 'true');
            injectHoverCSS();
        } else {
            localStorage.setItem('hoverCSSInjection', 'false');
            removeHoverCSS();
        }
    });

    let cursorEffectInstance = null;

    function applyCursorEffect(effect, options = {}) {
        if (cursorEffectInstance) {
            cursorEffectInstance.destroy();
        }

        switch (effect) {
            case 'fairyDustCursor':
                cursorEffectInstance = fairyDustCursor(options);
                break;
            case 'emojiCursor':
                cursorEffectInstance = emojiCursor(options);
                break;
            case 'springyEmojiCursor':
                cursorEffectInstance = springyEmojiCursor(options);
                break;
            case 'ghostCursor':
                cursorEffectInstance = ghostCursor(options);
                break;
            case 'trailingCursor':
                cursorEffectInstance = trailingCursor(options);
                break;
            case 'textFlag':
                cursorEffectInstance = textFlag(options);
                break;
            case 'followingDotCursor':
                cursorEffectInstance = followingDotCursor(options);
                break;
            case 'bubbleCursor':
                cursorEffectInstance = bubbleCursor(options);
                break;
            case 'snowflakeCursor':
                cursorEffectInstance = snowflakeCursor(options);
                break;
            case 'rainbowCursor':
                cursorEffectInstance = rainbowCursor(options);
                break;
            case 'clockCursor':
                cursorEffectInstance = clockCursor(options);
                break;
            case 'characterCursor':
                cursorEffectInstance = characterCursor(options);
                break;
            case 'starFadeCursor':
                cursorEffectInstance = StarFadeCursor(options);
                break;
            default:
                cursorEffectInstance = null;
        }

        console.log('Applied cursor effect:', effect, 'with options:', options);
    }

    function showCustomizationOptions(effect) {
        const customizationDiv = document.getElementById('cursorCustomization');
        const customizationInputs = document.getElementById('customizationInputs');
        customizationInputs.innerHTML = '';

        switch (effect) {
            case 'fairyDustCursor':
                customizationInputs.innerHTML = `
                    <label>Colors (comma-separated): <input type="text" id="fairyDustColors" value="red,green,blue"></label>
                `;
                break;
            case 'emojiCursor':
                customizationInputs.innerHTML = `
                    <label>Emojis (comma-separated): <input type="text" id="emojiList" value="🔥,🐬,🦆"></label>
                `;
                break;
            case 'springyEmojiCursor':
                customizationInputs.innerHTML = `
                    <label>Emoji: <input type="text" id="springyEmoji" value="🤷‍♂️"></label>
                `;
                break;
            case 'textFlag':
                customizationInputs.innerHTML = `
                    <label>Text: <input type="text" id="flagText" value="Hello"></label>
                    <label>Color (hex or name): <input type="text" id="flagColor" value="orange"></label>
                `;
                break;
            case 'trailingCursor':
                customizationInputs.innerHTML = `
                    <label>Particles: <input type="number" id="trailParticles" value="15"></label>
                    <label>Rate (0 to 1): <input type="number" id="trailRate" value="0.8" step="0.1"></label>
                    <label>Base Image Src (URL or base64): <input type="text" id="trailImageSrc" value=""></label>
                `;
                break;
            case 'characterCursor':
                customizationInputs.innerHTML = `
                    <label>Characters (comma-separated): <input type="text" id="characterList" value="h,e,l,l,o"></label>
                    <label>Font: <input type="text" id="characterFont" value="15px serif"></label>
                    <label>Colors (comma-separated hex or names): <input type="text" id="characterColors" value="purple,pink,red"></label>
                `;
                break;
            default:
                customizationDiv.style.display = 'none';
                return;
        }
        customizationDiv.style.display = 'block';
    }

    function isValidColor(strColor) {
        const s = new Option().style;
        s.color = strColor;
        return s.color !== '';
    }

    document.getElementById('cursorEffectSelector').addEventListener('change', function() {
        const selectedEffect = this.value;
        localStorage.setItem('cursorEffect', selectedEffect);
        showCustomizationOptions(selectedEffect);
        const savedPrefs = localStorage.getItem(`cursorPrefs_${selectedEffect}`);
        const options = savedPrefs ? JSON.parse(savedPrefs) : {};
        applyCursorEffect(selectedEffect, options);
    });

    document.getElementById('applyCustomization').addEventListener('click', function() {
        const selectedEffect = document.getElementById('cursorEffectSelector').value;
        let options = {};

        switch (selectedEffect) {
            case 'fairyDustCursor':
                options.colors = document.getElementById('fairyDustColors').value.split(',').map(color => color.trim()).filter(isValidColor);
                break;
            case 'emojiCursor':
                options.emoji = document.getElementById('emojiList').value.split(',').map(emoji => emoji.trim());
                break;
            case 'springyEmojiCursor':
                options.emoji = document.getElementById('springyEmoji').value.trim();
                break;
            case 'textFlag':
                options.text = document.getElementById('flagText').value.trim();
                options.color = isValidColor(document.getElementById('flagColor').value.trim()) ? document.getElementById('flagColor').value.trim() : '#FF6800';
                break;
            case 'trailingCursor':
                options.particles = parseInt(document.getElementById('trailParticles').value, 10);
                options.rate = parseFloat(document.getElementById('trailRate').value);
                options.baseImageSrc = document.getElementById('trailImageSrc').value.trim();
                break;
            case 'characterCursor':
                options.characters = document.getElementById('characterList').value.split(',').map(char => char.trim());
                options.font = document.getElementById('characterFont').value.trim();
                options.colors = document.getElementById('characterColors').value.split(',').map(color => color.trim()).filter(isValidColor);
                break;
        }

        localStorage.setItem(`cursorPrefs_${selectedEffect}`, JSON.stringify(options));
        applyCursorEffect(selectedEffect, options);
    });

    // Apply settings on load
    const savedFontSize = localStorage.getItem('fontSize');
    if (savedFontSize) {
        document.getElementById('fontSizeInput').value = savedFontSize;
        changeFontSize(savedFontSize);
    }

    if (localStorage.getItem('hoverCSSInjection') === 'true') {
        document.getElementById('hoverCSSInjection').checked = true;
        injectHoverCSS();
    } else {
        document.getElementById('hoverCSSInjection').checked = false;
        removeHoverCSS();
    }

    const savedCursorEffect = localStorage.getItem('cursorEffect');
    if (savedCursorEffect) {
        document.getElementById('cursorEffectSelector').value = savedCursorEffect;
        showCustomizationOptions(savedCursorEffect);
        const savedPrefs = localStorage.getItem(`cursorPrefs_${savedCursorEffect}`);
        const options = savedPrefs ? JSON.parse(savedPrefs) : {};
        applyCursorEffect(savedCursorEffect, options);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initMoreExtraSettings();
    });
} else {
    initMoreExtraSettings();
}



///////////////////////////////////////////////////////////////////////////////////////////////////////



class ClickSpark extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.root = document.documentElement;
      this.svg = null;
      this.enabled = false; // Track whether the effect is enabled
    }
  
    get activeEls() {
      return this.getAttribute("active-on");
    }
  
    connectedCallback() {
      this.setupSpark();
  
      this.root.addEventListener("click", (e) => {
        if (!this.enabled) return; // Only run if enabled
        if (this.activeEls && !e.target.matches(this.activeEls)) return;
  
        this.setSparkPosition(e);
        this.animateSpark();
      });
    }
  
    animateSpark() {
      let sparks = [...this.svg.children];
      let size = parseInt(sparks[0].getAttribute("y1"));
      let offset = size / 2 + "px";
  
      let keyframes = (i) => {
        let deg = `calc(${i} * (360deg / ${sparks.length}))`;
  
        return [
          {
            strokeDashoffset: size * 3,
            transform: `rotate(${deg}) translateY(${offset})`
          },
          {
            strokeDashoffset: size,
            transform: `rotate(${deg}) translateY(0)`
          }
        ];
      };
  
      let options = {
        duration: 660,
        easing: "cubic-bezier(0.25, 1, 0.5, 1)",
        fill: "forwards"
      };
  
      sparks.forEach((spark, i) => spark.animate(keyframes(i), options));
    }
  
    setSparkPosition(e) {
      let rect = this.root.getBoundingClientRect();
  
      this.svg.style.left =
        e.clientX - rect.left - this.svg.clientWidth / 2 + "px";
      this.svg.style.top =
        e.clientY - rect.top - this.svg.clientHeight / 2 + "px";
    }
  
    setupSpark() {
      let template = `
        <style>
          :host {
            display: contents;
          }
          
          svg {
            pointer-events: none;
            position: absolute;
            rotate: -20deg;
            stroke: var(--click-spark-color, currentColor);
          }
  
          line {
            stroke-dasharray: 30;
            stroke-dashoffset: 30;
            transform-origin: center;
          }
        </style>
        <svg width="30" height="30" viewBox="0 0 100 100" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">
          ${Array.from({ length: 8 }, () => '<line x1="50" y1="30" x2="50" y2="4"/>').join("")}
        </svg>
      `;
  
      this.shadowRoot.innerHTML = template;
      this.svg = this.shadowRoot.querySelector("svg");
    }
  
    toggle(enabled) {
      this.enabled = enabled;
    }
  }
  
  customElements.define("click-spark", ClickSpark);
  
  function initMoreExtraExtraSettings() {
    const moreExtraExtraSettingsHTML = `
      <div id="more-extra-extra-settings" style="padding: 10px;">
        <h3>Extra Extra Settings</h3>
        <label><input type="checkbox" id="newItemsOnly"> Enable New Items Only</label>
        <label><input type="checkbox" id="clickSparkToggle"> Enable Click Spark</label>
        <div class="extension-info">
          <p>This extension was developed by <a href="https://www.reddit.com/user/XxIIIBanIIIxX" target="_blank">reddit:u/XxIIIBanIIIxX</a>.</p>
          <p>Free for personal use. Not meant to be sold.</p>
          <p>I spent at least a hundred hours developing this extension. Despite starting with no coding knowledge, I am proud of what it has become. Initially, I planned to keep it to myself, but I realized it could benefit others, so I'm releasing it for everyone to enjoy.</p>
          <div class="support-section">
            <h4>Support</h4>
            <p>If you appreciate the work and feel like donating, you can do so via:</p>
            <p>Cash App: <strong>$KingGoBrr</strong></p>
          </div>
        </div>
      </div>
    `;
  
    // Insert the more extra extra settings into the settings modal
    const settingsModalBody = document.querySelector('#customSettingsModal .custom-modal-body');
    settingsModalBody.insertAdjacentHTML('beforeend', moreExtraExtraSettingsHTML);
  
    // Function to get found date for an item ASIN from the database
    async function getFoundDateForASIN(ASIN) {
      const db = await openDB('vineyard', 6);
      const item = await db.get('items', ASIN);
      if (item) {
        return item.foundDate;
      } else {
        return null;  // Return null if the item is not found
      }
    }
  
    // Function to filter items based on newness
    async function filterNewItems() {
      const newItemsOnly = document.getElementById('newItemsOnly').checked;
      const allItems = document.querySelectorAll('.vvp-item-tile');
  
      const promises = Array.from(allItems).map(async item => {
        const itemRecID = item.dataset.recommendationId;
        const [, ASIN] = itemRecID.split('#');
        const foundDate = await getFoundDateForASIN(ASIN);
  
        if (foundDate) {
          const isNew = (new Date() - new Date(foundDate)) < thirtyMinutes;
          if (newItemsOnly && !isNew) {
            item.style.display = 'none';
          } else {
            item.style.display = 'block';
          }
        } else {
          // If no found date, assume the item is old and hide it if filtering new items only
          if (newItemsOnly) {
            item.style.display = 'none';
          } else {
            item.style.display = 'block';
          }
        }
      });
  
      await Promise.all(promises);
    }
  
    // Event listener for the new items only checkbox
    document.getElementById('newItemsOnly').addEventListener('change', function() {
      localStorage.setItem('newItemsOnly', this.checked);
      setTimeout(filterNewItems, 2000); // Add delay before filtering items
    });
  
    // Apply settings on load
    if (localStorage.getItem('newItemsOnly') === 'true') {
      document.getElementById('newItemsOnly').checked = true;
      setTimeout(filterNewItems, 2000); // Add delay before filtering items on load
    }
  
    // Add the ClickSpark element to the DOM
    const clickSparkElement = document.createElement('click-spark');
    document.body.appendChild(clickSparkElement);
  
    // Event listener for the click spark checkbox
    document.getElementById('clickSparkToggle').addEventListener('change', function() {
      const clickSparkElement = document.querySelector('click-spark');
      if (clickSparkElement) {
        clickSparkElement.toggle(this.checked);
        localStorage.setItem('clickSparkEnabled', this.checked);
      }
    });
  
    // Apply click spark setting on load
    if (localStorage.getItem('clickSparkEnabled') === 'true') {
      document.getElementById('clickSparkToggle').checked = true;
      const clickSparkElement = document.querySelector('click-spark');
      if (clickSparkElement) {
        clickSparkElement.toggle(true);
      }
    }
  }
  
  // Initialize the extra extra settings when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initMoreExtraExtraSettings();
    });
  } else {
    initMoreExtraExtraSettings();
  }
  




//////////////////////////////////////////////////////////////////////////////////////////////////////////


// Function to wrap existing settings in a new div
function wrapSettingsInNewDiv() {
    // Create the new div with id sophiaftw
    const newDiv = document.createElement('div');
    newDiv.id = 'sophiaftw';

    // Find the existing divs with ids extra-settings and more-extra-settings
    const extraSettingsDiv = document.getElementById('extra-settings');
    const moreExtraSettingsDiv = document.getElementById('more-extra-settings');
    const moreextraextrasettingsdiv = document.getElementById('more-extra-extra-settings');

    // Check if all divs exist
    if (extraSettingsDiv && moreExtraSettingsDiv && moreextraextrasettingsdiv) {
        // Append the existing divs to the new div
        newDiv.appendChild(extraSettingsDiv);
        newDiv.appendChild(moreExtraSettingsDiv);
        newDiv.appendChild(moreextraextrasettingsdiv);

        // Insert the new div into the custom modal body
        const settingsModalBody = document.querySelector('.custom-modal-body');
        settingsModalBody.insertAdjacentElement('beforeend', newDiv);
    } else {
        console.error('One or more of the settings divs do not exist.');
    }
}

// Initialize the wrapping of settings when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        wrapSettingsInNewDiv(); // Wrap the settings in the new div
    });
} else {
    wrapSettingsInNewDiv(); // Wrap the settings in the new div
}



//////////////////////////////////////////////////////////////////////////////////////////////////////









//////////////////////////////////////////////////////////////////////////////////////////////////////

// Replace the existing Vine Help menu item with the Vine Automated menu
const vineHelpLink = document.getElementById('vvp-vine-help-link');
if (vineHelpLink) {
    vineHelpLink.innerHTML = `<a href="javascript:void(0)" id="vineAutomatedLink">Vine Automated</a>`;
}

// Create the Vine Automated modal content
const vineAutomatedModal = `
    <div id="vineAutomatedModal" class="custom-modal-content">
        <div class="custom-modal-header">
            <h2>Vine Automated <span class="question-mark" title="Automatically scans items and displays them in the existing grid. When done, continues to the next page.">?</span></h2>
        </div>
        <div class="custom-modal-body">
            <label class="switch">
                <input type="checkbox" id="vineAutomatedToggle">
                <span class="slider"></span>
            </label>
            <span id="vineAutomatedStatus">Feature is off</span>
        </div>
        <div class="custom-modal-footer">
            <button id="vineAutomatedDoneBtn" class="custom-button custom-button-primary">Done</button>
        </div>
    </div>
`;
document.body.insertAdjacentHTML('beforeend', vineAutomatedModal);

// Add event listeners to the Vine Automated menu item and modal buttons
document.getElementById('vineAutomatedLink').addEventListener('click', () => {
    document.getElementById('vineAutomatedModal').style.display = 'block';
});

document.getElementById('vineAutomatedDoneBtn').addEventListener('click', () => {
    document.getElementById('vineAutomatedModal').style.display = 'none';
    const isChecked = document.getElementById('vineAutomatedToggle').checked;
    document.getElementById('vineAutomatedStatus').textContent = isChecked ? 'Feature is on' : 'Feature is off';
    localStorage.setItem('vineAutomated', isChecked);
    applyVineAutomatedFeature(isChecked);
});

document.getElementById('vineAutomatedToggle').addEventListener('change', () => {
    const isChecked = document.getElementById('vineAutomatedToggle').checked;
    document.getElementById('vineAutomatedStatus').textContent = isChecked ? 'Feature is on' : 'Feature is off';
    localStorage.setItem('vineAutomated', isChecked);
});

// Apply the Vine Automated feature based on the toggle status
function applyVineAutomatedFeature(isOn) {
    if (isOn) {
        startVineAutomated();
    } else {
        stopVineAutomated();
    }
}

// Start the Vine Automated feature
function startVineAutomated() {
    observeGridItems(() => {
        // Introduce a delay before checking for items
        setTimeout(() => {
            const scanItems = document.querySelectorAll('.vvp-item-tile');
            const loadingItems = Array.from(scanItems).filter(item => {
                const priceSpan = item.querySelector('.vineyard-price');
                return priceSpan && priceSpan.textContent.includes('Loading ...');
            });

            if (loadingItems.length === 0) {
                showNoNewItemsPopup();
                return;
            }

            scanItems.forEach(item => {
                const priceSpan = item.querySelector('.vineyard-price');
                if (priceSpan && !priceSpan.textContent.includes('Loading ...')) {
                    item.classList.add('hide-item');
                } else {
                    item.classList.remove('hide-item');
                }
            });

            const originalGrid = document.getElementById('vvp-items-grid');
            originalGrid.style.position = 'fixed';
            originalGrid.style.top = '50%';
            originalGrid.style.left = '50%';
            originalGrid.style.transform = 'translate(-50%, -50%)';
            originalGrid.style.zIndex = '1001';
            originalGrid.style.backgroundColor = 'rgb(29, 31, 38)';
            originalGrid.style.border = '1px solid #ccc';
            originalGrid.style.padding = '40px';
            originalGrid.style.borderRadius = '8px';
            originalGrid.style.maxWidth = '90%';
            originalGrid.style.maxHeight = '90%';
            originalGrid.style.overflowY = 'auto';
            originalGrid.style.display = 'grid';
            originalGrid.style.gridTemplateColumns = 'repeat(6, 1fr)';
            originalGrid.style.gap = '10px';
            originalGrid.style.boxShadow = '#ffd700 0px 0px 4px 3px';

            const timer = document.createElement('div');
            timer.id = 'scanningTimer';
            timer.style.position = 'absolute';
            timer.style.top = '10px';
            timer.style.right = '10px';
            timer.style.color = 'cornsilk';
            timer.style.fontSize = '20px';
            originalGrid.appendChild(timer);

            const pauseButton = document.createElement('button');
            pauseButton.id = 'pauseButton';
            pauseButton.textContent = 'Pause';
            pauseButton.style.position = 'absolute';
            pauseButton.style.top = '10px';
            pauseButton.style.left = '10px';
            pauseButton.style.margin = '-6px';
            pauseButton.className = 'custom-button custom-button-primary';
            originalGrid.appendChild(pauseButton);

            const blurOverlay = document.createElement('div');
            blurOverlay.id = 'blurOverlay';
            blurOverlay.style.position = 'fixed';
            blurOverlay.style.top = 0;
            blurOverlay.style.left = 0;
            blurOverlay.style.width = '100%';
            blurOverlay.style.height = '100%';
            blurOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            blurOverlay.style.backdropFilter = 'blur(10px)';
            blurOverlay.style.zIndex = '1000';

            document.body.appendChild(blurOverlay);

            let isPaused = false;
            pauseButton.addEventListener('click', () => {
                isPaused = !isPaused;
                pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
            });

            const intervalId = setInterval(() => {
                if (Array.from(scanItems).every(item => {
                    const priceSpan = item.querySelector('.vineyard-price');
                    return priceSpan && !priceSpan.textContent.includes('Loading ...');
                })) {
                    clearInterval(intervalId);
                    startTimer();
                }
            }, 500);

            function startTimer() {
                let timerValue = 5;
                const timerInterval = setInterval(() => {
                    if (!isPaused) {
                        timerValue--;
                        timer.textContent = `Time remaining: ${timerValue}s`;
                        if (timerValue <= 0) {
                            clearInterval(timerInterval);
                            nextPage();
                        }
                    }
                }, 1000);
                // Save timer interval ID to stop it later if needed
                localStorage.setItem('timerIntervalId', timerInterval);
            }
        }, 2000); // Delay of 3 seconds before checking for items
    });
}

// Stop the Vine Automated feature
function stopVineAutomated() {
    const originalGrid = document.getElementById('vvp-items-grid');
    const blurOverlay = document.getElementById('blurOverlay');
    const scanItems = document.querySelectorAll('.vvp-item-tile');
    scanItems.forEach(item => {
        item.classList.remove('hide-item');
    });
    if (originalGrid) {
        originalGrid.removeAttribute('style'); // Remove the styles applied to make it fixed
    }
    if (blurOverlay) {
        blurOverlay.remove();
    }
    // Clear the timer interval if running
    const timerIntervalId = localStorage.getItem('timerIntervalId');
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        localStorage.removeItem(timerIntervalId);
    }
}

// Proceed to the next page
function nextPage() {
    const nextPageLink = document.querySelector('.a-pagination .a-last a');
    if (nextPageLink) {
        nextPageLink.click();
        // Wait for the new page to load and start the automated process again
        observeGridItems(startVineAutomated);
    }
}

// Wait for the new items to load before starting the automated process
function observeGridItems(callback) {
    const targetNode = document.getElementById('vvp-items-grid');
    if (targetNode) {
        callback();
    } else {
        const observer = new MutationObserver((mutationsList, observer) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && document.getElementById('vvp-items-grid')) {
                    observer.disconnect();
                    callback();
                    break;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

// Show popup for no new items
function showNoNewItemsPopup() {
    const popup = document.createElement('div');
    popup.id = 'noNewItemsPopup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.zIndex = '1001';
    popup.style.backgroundColor = 'rgb(29, 31, 38)';
    popup.style.border = '1px solid #ccc';
    popup.style.padding = '40px';
    popup.style.borderRadius = '8px';
    popup.style.textAlign = 'center';
    popup.style.fontSize = '18px';
    popup.style.color = 'cornsilk';
    popup.style.boxShadow = '#ffd700 0px 0px 4px 3px !important';

    let timerValue = 5;
    popup.textContent = `No new items. Moving on in ${timerValue}s`;

    document.body.appendChild(popup);

    const popupTimer = setInterval(() => {
        timerValue--;
        popup.textContent = `No new items. Moving on in ${timerValue}s`;
        if (timerValue <= 0) {
            clearInterval(popupTimer);
            popup.remove();
            nextPage();
        }
    }, 1000);
}

// Load the initial state of the Vine Automated feature
const isOn = localStorage.getItem('vineAutomated') === 'true';
const vineAutomatedToggle = document.getElementById('vineAutomatedToggle');
const vineAutomatedStatus = document.getElementById('vineAutomatedStatus');

if (vineAutomatedToggle) {
    vineAutomatedToggle.checked = isOn;
}

if (vineAutomatedStatus) {
    vineAutomatedStatus.textContent = isOn ? 'Feature is on' : 'Feature is off';
}

// Function to start the Vine Automated feature once the grid is loaded
function startVineAutomatedWhenGridLoads() {
    observeGridItems(startVineAutomated);
}

if (isOn) {
    startVineAutomatedWhenGridLoads();
}

// Event listener to turn off the feature with ESC key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        stopVineAutomated();
        localStorage.setItem('vineAutomated', 'false');
        const vineAutomatedToggle = document.getElementById('vineAutomatedToggle');
        const vineAutomatedStatus = document.getElementById('vineAutomatedStatus');

        if (vineAutomatedToggle) {
            vineAutomatedToggle.checked = false;
        }

        if (vineAutomatedStatus) {
            vineAutomatedStatus.textContent = 'Feature is off';
        }

        // Remove the pause button
        const pauseButton = document.getElementById('pauseButton');
        if (pauseButton) {
            pauseButton.remove();
        }

        // Stop the timer that starts when scan finishes
        const timerIntervalId = localStorage.getItem('timerIntervalId');
        if (timerIntervalId) {
            clearInterval(timerIntervalId);
            localStorage.removeItem('timerIntervalId');
        }

        // Remove the timer text
        const scanningTimer = document.getElementById('scanningTimer');
        if (scanningTimer) {
            scanningTimer.remove();
        }
    }
});



// CSS to hide items
const style = document.createElement('style');
style.type = 'text/css';
style.innerHTML = `
    .hide-item {
        display: none !important;
    }
`;
document.head.appendChild(style);




///////////////////////////////////////////////////////////////////////////////////////////////////////////
// Add Keyword Hider Button
function addKeywordHiderButton() {
    const searchBox = document.getElementById('vvp-search-text-input');
    const prefsButton = document.getElementById('prefs-button');
    if (searchBox && prefsButton) {
        const keywordHiderButtonHTML = `
            <span id="keyword-hider-button" class="a-button a-button-normal a-button-toggle" role="button">
                <span class="a-button-inner">
                    <a class="a-button-text">Hide KW</a>
                </span>
            </span>
        `;
        prefsButton.parentNode.insertBefore(document.createRange().createContextualFragment(keywordHiderButtonHTML), prefsButton);

        document.getElementById('keyword-hider-button').addEventListener('click', toggleKeywordHiderMenu);
    }
}

// Toggle Keyword Hider Menu
function toggleKeywordHiderMenu() {
    const menuExists = document.getElementById('keyword-hider-menu');
    if (menuExists) {
        menuExists.style.display = menuExists.style.display === 'block' ? 'none' : 'block';
    } else {
        createKeywordHiderMenu();
    }
}

// Create Keyword Hider Menu
function createKeywordHiderMenu() {
    const menuHTML = `
        <div id="keyword-hider-menu" style="position: absolute; background-color: #1C1F26; border: 1px solid #ccc; padding: 10px; display: block; z-index: 1000; border-radius: 8px;">
            <label style="color: white;"><input type="checkbox" id="hide-keywords-toggle"> Hide keywords</label>
            <button id="edit-keywords-button" class="custom-button custom-button-primary" style="margin-left: 10px;">Add/Remove Keywords</button>
            <span id="keyword-toggle-status" style="color: white; margin-left: 10px;">Feature is off</span>
            <div id="hidden-items-count" style="color: white; margin-top: 10px;">Hidden items: 0</div>
        </div>
    `;
    const searchBox = document.getElementById('vvp-search-text-input');
    searchBox.parentNode.insertAdjacentHTML('beforeend', menuHTML);

    document.getElementById('hide-keywords-toggle').addEventListener('change', toggleKeywordVisibility);
    document.getElementById('edit-keywords-button').addEventListener('click', editKeywords);
    updateKeywordToggleStatus();
}

// Toggle Keyword Visibility
function toggleKeywordVisibility() {
    const isChecked = document.getElementById('hide-keywords-toggle').checked;
    localStorage.setItem('hideKeywordsVine', isChecked);
    updateKeywordToggleStatus();
    applyKeywordHider();
}

function updateKeywordToggleStatus() {
    const status = localStorage.getItem('hideKeywordsVine') === 'true' ? 'Feature is on' : 'Feature is off';
    document.getElementById('keyword-toggle-status').textContent = status;
    document.getElementById('hide-keywords-toggle').checked = localStorage.getItem('hideKeywordsVine') === 'true';
}

// Edit Keywords
function editKeywords() {
    const currentKeywords = localStorage.getItem('keywordsVine') || '';
    const newKeywords = prompt('Enter the keywords to monitor (separated by commas):', currentKeywords);
    if (newKeywords !== null) {
        localStorage.setItem('keywordsVine', newKeywords);
        applyKeywordHider();
    }
}

// Apply Keyword Hider Functionality
function applyKeywordHider() {
    const isOn = localStorage.getItem('hideKeywordsVine') === 'true';
    const keywords = (localStorage.getItem('keywordsVine') || '').split(',').map(kw => kw.trim().toLowerCase());

    const items = document.querySelectorAll('.vvp-item-tile');
    let hiddenCount = 0;

    items.forEach(item => {
        const itemText = item.textContent.toLowerCase();
        const shouldHide = isOn && keywords.some(kw => itemText.includes(kw));
        if (shouldHide) {
            item.style.display = 'none';
            hiddenCount++;
        } else {
            item.style.display = '';
        }
    });

    const hiddenItemsCountElement = document.getElementById('hidden-items-count');
    if (hiddenItemsCountElement) {
        hiddenItemsCountElement.textContent = `Hidden items: ${hiddenCount}`;
    }
}

// Initialize the Keyword Hider on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        addKeywordHiderButton();
        applyKeywordHider();
    });
} else {
    addKeywordHiderButton();
    applyKeywordHider();
}


/////////////// random section for replacing random shit lol lets call it KingsChanges ////////////////////


//replaces the inner link of vine items tab to redirect to adittional itrems isntead of available for all

// Find the existing list item
const vineItemsTab = document.getElementById('vvp-vine-items-tab');

if (vineItemsTab) {
    // Create a new list item with the updated content
    const newVineItemsTab = document.createElement('li');
    newVineItemsTab.id = 'vvp-vine-items-tab';
    newVineItemsTab.className = 'a-tab-heading a-active';
    newVineItemsTab.setAttribute('role', 'presentation');
    newVineItemsTab.innerHTML = '<a href="https://www.amazon.com/vine/vine-items?queue=encore" role="tab" aria-selected="true">Vine Items</a>';

    // Replace the old list item with the new one
    vineItemsTab.parentNode.replaceChild(newVineItemsTab, vineItemsTab);
}


// Initialize the infinite scroll flag and page counter
let isLoadingNextPage = false;
let infiniteScrollPageCounter = 1; // Assuming the first page is loaded initially

// Function to initialize the manual scroll loader
function initManualScrollLoader() {
    const loadNextButton = document.createElement('button');
    loadNextButton.id = 'load-next-button';
    loadNextButton.textContent = 'Load Next Page';
    loadNextButton.style.position = 'fixed';
    loadNextButton.style.right = '20px';
    loadNextButton.style.bottom = '20px';
    loadNextButton.style.zIndex = '1000';
    loadNextButton.style.backgroundColor = '#ff9900';
    loadNextButton.style.color = 'white';
    loadNextButton.style.border = 'none';
    loadNextButton.style.borderRadius = '5px';
    loadNextButton.style.padding = '10px';
    loadNextButton.style.cursor = 'pointer';
    document.body.appendChild(loadNextButton);

    loadNextButton.addEventListener('click', () => {
        if (!isLoadingNextPage) {
            isLoadingNextPage = true;
            loadNextPage();
        }
    });

    updatePageCounter(); // Initial update for the page counter
}

// Function to load the next page
function loadNextPage() {
    const nextPageLink = document.querySelector('.a-pagination .a-last a');
    if (nextPageLink) {
        fetch(nextPageLink.href)
            .then(response => response.text())
            .then(data => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data, 'text/html');
                const newItems = doc.querySelectorAll('.vvp-item-tile');
                const grid = document.getElementById('vvp-items-grid');
                newItems.forEach(item => grid.appendChild(item));

                // Update pagination link
                const newNextPageLink = doc.querySelector('.a-pagination .a-last a');
                if (newNextPageLink) {
                    nextPageLink.href = newNextPageLink.href;
                } else {
                    nextPageLink.remove(); // No more pages to load
                    document.getElementById('load-next-button').style.display = 'none'; // Hide the button if no more pages
                }

                // Reapply keyword hider
                applyKeywordHider();

                // Update current page counter
                infiniteScrollPageCounter++;
                updatePageCounter();

                isLoadingNextPage = false; // Reset the loading flag

                // Call your functions with a 1-second delay
                setTimeout(() => {
                    if (localStorage.getItem('addEtvButton') === 'true') {
                        document.querySelectorAll('.vvp-item-tile-content').forEach(tileContentEl => {
                            handleETVButton(tileContentEl, true);
                        });
                    }

                    if (localStorage.getItem('fixSpinnerButton') === 'true') {
                        document.querySelectorAll('.vvp-item-tile-content').forEach(tileContentEl => {
                            handleFixSpinnerButton(tileContentEl, true);
                        });
                    }
                }, 1000); // 1-second delay

            })
            .catch(error => {
                console.error('Error loading next page:', error);
                isLoadingNextPage = false; // Reset the loading flag even if there's an error
            });
    }
}

// Function to update the page counter
function updatePageCounter() {
    const paginationContainer = document.querySelector('.a-pagination');
    if (paginationContainer) {
        let pageCounter = document.getElementById('page-counter');
        if (!pageCounter) {
            pageCounter = document.createElement('li');
            pageCounter.id = 'page-counter';
            pageCounter.className = 'a-normal';
            pageCounter.style.color = 'white';
            pageCounter.style.marginTop = '10px';
            paginationContainer.appendChild(pageCounter);
        }
        pageCounter.textContent = `Loaded up to page ${infiniteScrollPageCounter}`;
    }
}

// Add Infinite Scroll Button
function addInfiniteScrollButton() {
    const searchBox = document.getElementById('vvp-search-text-input');
    const prefsButton = document.getElementById('prefs-button');
    if (searchBox && prefsButton) {
        const infiniteScrollButtonHTML = `
            <span id="infinite-scroll-button" class="a-button a-button-normal a-button-toggle" role="button">
                <span class="a-button-inner">
                    <a class="a-button-text">Infinite Scroll</a>
                </span>
            </span>
        `;
        prefsButton.parentNode.insertBefore(document.createRange().createContextualFragment(infiniteScrollButtonHTML), prefsButton);

        document.getElementById('infinite-scroll-button').addEventListener('click', toggleInfiniteScrollMenu);
    }
}

// Toggle Infinite Scroll Menu
function toggleInfiniteScrollMenu() {
    const menuExists = document.getElementById('infinite-scroll-menu');
    if (menuExists) {
        menuExists.style.display = menuExists.style.display === 'block' ? 'none' : 'block';
    } else {
        createInfiniteScrollMenu();
    }
}

// Create Infinite Scroll Menu
function createInfiniteScrollMenu() {
    const menuHTML = `
        <div id="infinite-scroll-menu" style="position: absolute; background-color: #1C1F26; border: 1px solid #ccc; padding: 10px; display: block; z-index: 1000; border-radius: 8px;">
            <label style="color: white;"><input type="checkbox" id="infinite-scroll-toggle"> Infinite Scroll</label>
            <span id="infinite-scroll-status" style="color: white; margin-left: 10px;">Feature is off</span>
        </div>
    `;
    const searchBox = document.getElementById('vvp-search-text-input');
    searchBox.parentNode.insertAdjacentHTML('beforeend', menuHTML);

    document.getElementById('infinite-scroll-toggle').addEventListener('change', toggleInfiniteScroll);
    updateInfiniteScrollStatus();
}

// Toggle Infinite Scroll
function toggleInfiniteScroll() {
    const isChecked = document.getElementById('infinite-scroll-toggle').checked;
    localStorage.setItem('infiniteScrollVine', isChecked);
    updateInfiniteScrollStatus();
    if (isChecked) {
        initManualScrollLoader();
    } else {
        const loadNextButton = document.getElementById('load-next-button');
        if (loadNextButton) {
            loadNextButton.remove();
        }
    }
}

function updateInfiniteScrollStatus() {
    const status = localStorage.getItem('infiniteScrollVine') === 'true' ? 'Feature is on' : 'Feature is off';
    document.getElementById('infinite-scroll-status').textContent = status;
    document.getElementById('infinite-scroll-toggle').checked = localStorage.getItem('infiniteScrollVine') === 'true';
}

// Initialize the Infinite Scroll on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        addInfiniteScrollButton();
        if (localStorage.getItem('infiniteScrollVine') === 'true') {
            initManualScrollLoader();
        }
    });
} else {
    addInfiniteScrollButton();
    if (localStorage.getItem('infiniteScrollVine') === 'true') {
        initManualScrollLoader();
    }
}
