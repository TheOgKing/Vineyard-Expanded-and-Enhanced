function inject(file, tag) {
	const node = document.getElementsByTagName(tag)[0];
	const script = document.createElement('script');
	script.setAttribute('type', 'module');
	script.setAttribute('src', file);
	node.appendChild(script);
}

// Inject individual cursor scripts
const cursors = [
    'cursors/bubbleCursor.js',
    'cursors/characterCursor.js',
    'cursors/clockCursor.js',
    'cursors/emojiCursor.js',
    'cursors/fairyDustCursor.js',
    'cursors/ghostCursor.js',
    'cursors/followingDotCursor.js',
    'cursors/rainbowCursor.js',
    'cursors/snowflakeCursor.js',
    'cursors/springyEmojiCursor.js',
    'cursors/textFlag.js',
    'cursors/trailingCursor.js',
    'cursors/StarFadeCursor.js'
];

cursors.forEach(cursor => inject(chrome.runtime.getURL(cursor), 'body'));


const pointers = [
    'pointers/AmericanFlagPointer.js',
    'pointers/MinecraftSwordPointer.js',
    'pointers/PizzaCatPointer.js',
    'pointers/EnchantedMinecraftSwordPointer.js',
    'pointers/AnyaForgerPointer.js'
];

pointers.forEach(pointer => inject(chrome.runtime.getURL(pointer), 'body'));

// Inject other necessary scripts
inject(chrome.runtime.getURL('scripts/vineyard.js'), 'body');
inject(chrome.runtime.getURL('scripts/jszip.min.js'), 'body');
inject(chrome.runtime.getURL('scripts/updatenotification.js'), 'body')
inject(chrome.runtime.getURL('scripts/idbindex.js'), 'body')