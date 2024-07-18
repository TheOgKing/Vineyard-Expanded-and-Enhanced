window.onload = () => {
    // Set the current version manually for testing purposes
    const currentVersion = '1.9.3.2';

    // Change log for the latest version
    const changeLog = `
        <ul>
            <li id="changelog">Fixed minor bugs</li>
            <li id="changelog">Inifinite scroll feature now loads the next page automatically when reaching the bottom of the page</li>
            <li id="changelog">Added 3 new cursor pointers</li>
            <li id="changelog">Any problems, bugs or feature requests? send a dm to u/XxIIIBanIIIxX on reddit</li>
        </ul>
    `;

    function showUpdateNotification(version) {
        // Create the popup element
        const popup = document.createElement('div');
        popup.innerHTML = `
            <div id="extension-update-popup" style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #1d1f26;
                border: 1px solid rgb(204, 204, 204);
                box-shadow: rgb(255 207 64) 0px 0px 8px 3px;
                padding: 20px;
                z-index: 1000;
                width: 300px;
                font-family: Arial, sans-serif;
            ">
                <h3 style="margin-top: 0;">Extension Updated!</h3>
                <p>New version: ${version}</p>
                <div>${changeLog}</div>
                <button id="close-popup" style="
                    margin-top: 10px;
                    padding: 5px 10px;
                    background: #ffcc00;
                    border: none;
                    cursor: pointer;
                    border-radius: 4px;
                ">Close</button>
            </div>
        `;

        // Append the popup to the body
        document.body.appendChild(popup);

        // Add event listener to the close button
        document.getElementById('close-popup').addEventListener('click', function() {
            document.getElementById('extension-update-popup').remove();
        });
    }

    const storedVersion = localStorage.getItem('extensionVersion');
    console.log('Stored version:', storedVersion);
    console.log('Current version:', currentVersion);

    if (storedVersion !== currentVersion) {
        console.log('Showing update notification');
        showUpdateNotification(currentVersion);
        localStorage.setItem('extensionVersion', currentVersion);
    } else {
        console.log('No update notification needed');
    }
};
