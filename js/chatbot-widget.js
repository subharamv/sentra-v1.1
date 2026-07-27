// Chatbot Widget Loader
// This script loads the chatbot HTML and inserts it into the page

(function () {
    // Check if chatbot is already loaded
    if (document.getElementById('chatbot-container')) {
        console.log('Chatbot already loaded');
        return;
    }

    // Function to load chatbot HTML
    function loadChatbot() {
        console.log('Loading chatbot...');
        fetch('../chatbot.html')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load chatbot.html: ' + response.status);
                }
                return response.text();
            })
            .then(html => {
                console.log('Chatbot HTML loaded, inserting...');
                // Insert the chatbot HTML into the body
                document.body.insertAdjacentHTML('beforeend', html);

                // Load the chatbot script after inserting HTML
                const script = document.createElement('script');
                script.src = '../js/chatbot.js';
                script.onload = function () {
                    console.log('Chatbot script loaded successfully');
                };
                script.onerror = function () {
                    console.error('Failed to load chatbot script');
                };
                document.body.appendChild(script);
            })
            .catch(error => {
                console.error('Error loading chatbot:', error);
            });
    }

    // Load chatbot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadChatbot);
    } else {
        loadChatbot();
    }
})();