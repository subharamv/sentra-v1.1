/**
 * API Configuration
 * Determines the backend API URL based on environment
 */

const getApiUrl = () => {
    // Get from environment variable first
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }

    // For browser environment, check window variable
    if (typeof window !== 'undefined' && window.__API_URL__) {
        return window.__API_URL__;
    }

    // Default fallback based on current domain
    if (typeof window !== 'undefined') {
        // If on Netlify, use backend domain from environment or default
        if (window.location.hostname.includes('netlify.app')) {
            // Development: use environment variable or localhost
            return process.env.REACT_APP_API_URL || 'https://api.sentratech.netlify.app';
        }

        // Local development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3000';
        }
    }

    // Default to relative path (for same-domain API)
    return '';
};

const API_URL = getApiUrl();

export { API_URL, getApiUrl };
