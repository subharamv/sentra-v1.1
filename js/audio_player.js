/**
 * Sentra Audio Player - Reusable Component
 * Custom audio player with transcription support
 */

class SentraAudioPlayer {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Audio player container with ID "${containerId}" not found`);
            return;
        }

        // Configuration
        this.config = {
            audioURL: options.audioURL || "https://example.com/audio.mp3",
            srtURL: options.srtURL || "https://example.com/subtitles.srt",
            title: options.title || "Audio Title",
            ...options
        };

        // State
        this.segments = [];
        this.srtText = "";
        this.currentSegmentIndex = -1;
        this.lastSegmentIndex = -1;
        this.isMiniMode = false;
        this.scrollThreshold = 200;

        // Initialize
        this.init();
    }

    init() {
        this.createPlayerHTML();
        this.bindElements();
        this.attachEventListeners();
        this.loadAssets();
    }

    createPlayerHTML() {
        this.container.innerHTML = `
            <div class="audio-player-container">
                <div class="audio-player-wrap">
                    <div class="audio-player" role="region" aria-label="Audio player">
                        <!-- Top: title + total time -->
                        <div class="top">
                            <div class="title" id="playerTitle">${this.config.title}</div>
                            <div class="time" id="durationLabel">00:00 / 00:00</div>
                        </div>

                        <!-- Main -->
                        <div class="main">
                            <!-- Left play + volume -->
                            <div class="play-wrap">
                                <button class="play-btn" id="playBtn" aria-label="Play/Pause">
                                    <svg class="icon" viewBox="0 0 24 24" id="playIcon">
                                        <path d="M6 4l15 8-15 8z"></path>
                                    </svg>
                                </button>

                                <!-- Volume control -->
                                <div class="volume-control" title="Volume">
                                    <input id="volumeSlider" type="range" min="0" max="1" step="0.01" value="1" />
                                </div>
                            </div>

                            <!-- Right: progress area -->
                            <div class="player-right">
                                <div class="progress-outer">
                                    <div class="time-left" id="currentLabel">00:00</div>
                                    <div class="progress" id="progressBar" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                                        <div class="bar" id="progressBarInner"></div>
                                    </div>
                                    <div class="time-left" style="min-width:64px;text-align:right" id="totalLabel">00:00</div>
                                </div>

                                <div class="meta" style="margin-top:10px;">
                                    <div class="left">
                                        <small style="color:var(--audio-muted)">SENTRA</small>
                                    </div>
                                    <div class="right">
                                        <span class="download-srt" id="downloadSrt">⤓</span>
                                        <span style="color:var(--audio-muted)">⋯</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Transcription toggle -->
                        <div class="bottom-row">
                            <button class="toggle-trans" id="toggleTransBtn" aria-pressed="false">Show Transcription</button>
                        </div>

                        <!-- Transcription panel (hidden initially) -->
                        <div id="transcriptionPanel" class="transcription hidden" aria-live="polite">
                            <div class="transcription-scroll-container">
                                <div id="linePrev" class="trans-line muted">Previous line</div>
                                <div id="lineActive" class="trans-line active">Current line</div>
                                <div id="lineNext" class="trans-line muted">Next line</div>
                            </div>

                            <div class="progress-mini" style="margin-top:8px">
                                <i id="segmentProgressMini" style="width:20%"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Hidden native audio element -->
                <audio id="audio" preload="metadata" class="hidden"></audio>
                
                <!-- Mini Player (YouTube-style) -->
                <div class="mini-audio-player" id="miniPlayer">
                    <button class="mini-play-btn" id="miniPlayBtn" aria-label="Play/Pause">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M6 4l15 8-15 8z"></path>
                        </svg>
                    </button>
                    
                    <div class="mini-info">
                        <div class="mini-title" id="miniTitle">${this.config.title}</div>
                        <div class="mini-progress-container">
                            <span class="mini-time" id="miniCurrentTime">00:00</span>
                            <div class="mini-progress" id="miniProgress">
                                <div class="mini-bar" id="miniProgressBar"></div>
                            </div>
                            <span class="mini-time" id="miniTotalTime">00:00</span>
                        </div>
                    </div>
                    
                    <div class="mini-controls">
                        <button class="mini-expand-btn" id="miniExpandBtn" aria-label="Expand player">
                            <svg viewBox="0 0 24 24">
                                <path d="M7 14l5-5 5 5z"/>
                            </svg>
                        </button>
                        <button class="mini-close-btn" id="miniCloseBtn" aria-label="Close player">
                            <svg viewBox="0 0 24 24">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    bindElements() {
        const container = this.container;
        
        this.audio = container.querySelector('#audio');
        this.playBtn = container.querySelector('#playBtn');
        this.playIcon = container.querySelector('#playIcon');
        this.progressBar = container.querySelector('#progressBar');
        this.progressBarInner = container.querySelector('#progressBarInner');
        this.currentLabel = container.querySelector('#currentLabel');
        this.totalLabel = container.querySelector('#totalLabel');
        this.durationLabel = container.querySelector('#durationLabel');
        this.volumeSlider = container.querySelector('#volumeSlider');
        this.toggleTransBtn = container.querySelector('#toggleTransBtn');
        this.transcriptionPanel = container.querySelector('#transcriptionPanel');
        this.elPrev = container.querySelector('#linePrev');
        this.elActive = container.querySelector('#lineActive');
        this.elNext = container.querySelector('#lineNext');
        this.segProgressMini = container.querySelector('#segmentProgressMini');
        this.downloadSrtBtn = container.querySelector('#downloadSrt');
        
        // Mini player elements
        this.miniPlayer = container.querySelector('#miniPlayer');
        this.miniPlayBtn = container.querySelector('#miniPlayBtn');
        this.miniTitle = container.querySelector('#miniTitle');
        this.miniCurrentTime = container.querySelector('#miniCurrentTime');
        this.miniTotalTime = container.querySelector('#miniTotalTime');
        this.miniProgress = container.querySelector('#miniProgress');
        this.miniProgressBar = container.querySelector('#miniProgressBar');
        this.miniExpandBtn = container.querySelector('#miniExpandBtn');
        this.miniCloseBtn = container.querySelector('#miniCloseBtn');
    }

    attachEventListeners() {
        // Play/Pause
        this.playBtn.addEventListener('click', () => {
            if (this.audio.paused) {
                this.audio.play();
            } else {
                this.audio.pause();
            }
        });

        // Audio events
        this.audio.addEventListener('play', () => this.setPlayIcon(true));
        this.audio.addEventListener('pause', () => this.setPlayIcon(false));
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('timeupdate', () => this.updateProgress());

        // Volume control
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = parseFloat(e.target.value);
        });

        // Progress bar click
        this.progressBar.addEventListener('click', (e) => this.seekTo(e));

        // Transcription toggle
        this.toggleTransBtn.addEventListener('click', () => this.toggleTranscription());

        // Download SRT
        this.downloadSrtBtn.addEventListener('click', () => this.downloadSRT());

        // Transcription line clicks
        this.elPrev.addEventListener('click', () => this.seekToSegment(this.currentSegmentIndex - 1));
        this.elActive.addEventListener('click', () => this.seekToSegment(this.currentSegmentIndex));
        this.elNext.addEventListener('click', () => this.seekToSegment(this.currentSegmentIndex + 1));

        // Mini player controls
        this.miniPlayBtn.addEventListener('click', () => {
            if (this.audio.paused) {
                this.audio.play();
            } else {
                this.audio.pause();
            }
        });

        this.miniProgress.addEventListener('click', (e) => this.seekTo(e, true));
        this.miniExpandBtn.addEventListener('click', () => this.expandFromMini());
        this.miniCloseBtn.addEventListener('click', () => this.closeMiniPlayer());

        // Scroll detection for mini player
        window.addEventListener('scroll', () => this.handleScroll());
        
        // Intersection Observer for main player visibility
        this.setupIntersectionObserver();
        
        // Mobile progress bar click handler
        this.setupMobileProgressBar();
    }

    async loadAssets() {
        try {
            this.audio.src = this.config.audioURL;
            
            // Load SRT if available
            if (this.config.srtURL) {
                try {
                    const response = await fetch(this.config.srtURL);
                    if (response.ok) {
                        this.srtText = await response.text();
                        this.segments = this.parseSRT(this.srtText);
                    }
                } catch (err) {
                    console.warn('SRT not available or failed to load', err);
                }
            }
        } catch (err) {
            console.error('Failed to load audio assets', err);
        }
    }

    // Utility functions
    formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) return "00:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    setPlayIcon(isPlaying) {
        const goldColor = getComputedStyle(document.documentElement).getPropertyValue('--audio-gold').trim() || '#f1d79a';
        
        const playIcon = `<svg class="icon" viewBox="0 0 24 24">
            <path d="M6 4l15 8-15 8z" fill="${goldColor}"></path>
        </svg>`;
        
        const pauseIcon = `<svg class="icon" viewBox="0 0 24 24">
            <rect x="5" y="4" width="4" height="16" rx="1" fill="${goldColor}"></rect>
            <rect x="15" y="4" width="4" height="16" rx="1" fill="${goldColor}"></rect>
        </svg>`;
        
        // Update main player
        this.playBtn.innerHTML = isPlaying ? pauseIcon : playIcon;
        
        // Update mini player
        this.miniPlayBtn.innerHTML = isPlaying ? pauseIcon : playIcon;
    }

    updateDuration() {
        const duration = this.audio.duration;
        this.totalLabel.textContent = this.formatTime(duration);
        this.durationLabel.textContent = `00:00 / ${this.formatTime(duration)}`;
        this.miniTotalTime.textContent = this.formatTime(duration);
    }

    updateProgress() {
        const currentTime = this.audio.currentTime;
        const duration = this.audio.duration;
        
        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            this.progressBarInner.style.width = `${percentage}%`;
            this.currentLabel.textContent = this.formatTime(currentTime);
            this.durationLabel.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
            
            // Update mini player
            this.miniProgressBar.style.width = `${percentage}%`;
            this.miniCurrentTime.textContent = this.formatTime(currentTime);
            
            // Update mobile progress bar (above play button)
            this.container.style.setProperty('--mobile-progress', `${percentage * 0.8}%`);
            
            // Update transcription
            this.updateTranscription(currentTime);
        }
    }

    seekTo(event, isMini = false) {
        const progressElement = isMini ? this.miniProgress : this.progressBar;
        const rect = progressElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * this.audio.duration;
        
        if (isFinite(newTime)) {
            this.audio.currentTime = newTime;
        }
    }

    toggleTranscription() {
        const isHidden = this.transcriptionPanel.classList.contains('hidden');
        
        if (isHidden) {
            this.transcriptionPanel.classList.remove('hidden');
            this.toggleTransBtn.textContent = 'Hide Transcription';
            this.toggleTransBtn.setAttribute('aria-pressed', 'true');
        } else {
            this.transcriptionPanel.classList.add('hidden');
            this.toggleTransBtn.textContent = 'Show Transcription';
            this.toggleTransBtn.setAttribute('aria-pressed', 'false');
        }
    }

    downloadSRT() {
        if (!this.srtText) {
            alert('No transcription available for download');
            return;
        }
        
        const blob = new Blob([this.srtText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.config.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.srt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // SRT parsing functions
    timestampToSeconds(timestamp) {
        const parts = timestamp.trim().replace(',', '.').split(':');
        const hours = parseFloat(parts[parts.length - 3] || 0);
        const minutes = parseFloat(parts[parts.length - 2] || 0);
        const seconds = parseFloat(parts[parts.length - 1] || 0);
        return hours * 3600 + minutes * 60 + seconds;
    }

    parseSRT(text) {
        const blocks = text.replace(/\r/g, '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
        const segments = [];
        
        for (const block of blocks) {
            const lines = block.split('\n').filter(Boolean);
            if (!lines.length) continue;
            
            // Remove sequence number if present
            if (/^\d+$/.test(lines[0])) lines.shift();
            
            const timestampLine = lines.shift() || '';
            const match = timestampLine.match(/(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/);
            
            if (!match) continue;
            
            const start = this.timestampToSeconds(match[1]);
            const end = this.timestampToSeconds(match[2]);
            const text = lines.join(' ').replace(/<[^>]+>/g, '').trim();
            
            if (text) {
                segments.push({ start, end, text });
            }
        }
        
        return segments.sort((a, b) => a.start - b.start);
    }

    findSegmentIndex(currentTime) {
        for (let i = 0; i < this.segments.length; i++) {
            if (currentTime >= this.segments[i].start && currentTime <= this.segments[i].end) {
                return i;
            }
        }
        
        const nextIndex = this.segments.findIndex(s => s.start > currentTime);
        return nextIndex === -1 ? this.segments.length - 1 : Math.max(0, nextIndex - 1);
    }

    updateTranscription(currentTime) {
        if (this.segments.length === 0) return;
        
        const segmentIndex = this.findSegmentIndex(currentTime);
        
        if (segmentIndex !== this.currentSegmentIndex) {
            this.currentSegmentIndex = segmentIndex;
            this.smoothTransitionTranscription(segmentIndex);
        }
        
        // Update mini progress bar for current segment
        const currentSegment = this.segments[segmentIndex];
        if (currentSegment) {
            const segmentProgress = ((currentTime - currentSegment.start) / (currentSegment.end - currentSegment.start)) * 100;
            this.segProgressMini.style.width = `${Math.max(0, Math.min(100, segmentProgress))}%`;
        }
    }

    smoothTransitionTranscription(segmentIndex) {
        const prevSegment = this.segments[segmentIndex - 1];
        const currentSegment = this.segments[segmentIndex];
        const nextSegment = this.segments[segmentIndex + 1];
        
        // Determine transition direction
        const isMovingForward = segmentIndex > this.lastSegmentIndex;
        this.lastSegmentIndex = segmentIndex;
        
        if (isMovingForward) {
            this.slideTranscriptionForward(prevSegment, currentSegment, nextSegment);
        } else {
            this.slideTranscriptionBackward(prevSegment, currentSegment, nextSegment);
        }
    }

    slideTranscriptionForward(prevSegment, currentSegment, nextSegment) {
        // Add slide-out animation to current lines
        this.elPrev.classList.add('slide-out');
        this.elActive.classList.add('slide-out');
        this.elNext.classList.add('slide-out');
        
        // After slide-out animation, update content and slide in
        setTimeout(() => {
            // Update content
            this.elPrev.textContent = prevSegment ? prevSegment.text : '';
            this.elActive.textContent = currentSegment ? currentSegment.text : '';
            this.elNext.textContent = nextSegment ? nextSegment.text : '';
            
            // Remove slide-out and add slide-in
            this.elPrev.classList.remove('slide-out');
            this.elActive.classList.remove('slide-out');
            this.elNext.classList.remove('slide-out');
            
            this.elPrev.classList.add('slide-in');
            this.elActive.classList.add('slide-in');
            this.elNext.classList.add('slide-in');
            
            // Clean up slide-in classes after animation
            setTimeout(() => {
                this.elPrev.classList.remove('slide-in');
                this.elActive.classList.remove('slide-in');
                this.elNext.classList.remove('slide-in');
            }, 400);
        }, 200);
    }

    slideTranscriptionBackward(prevSegment, currentSegment, nextSegment) {
        // For backward movement, use a different animation
        this.elPrev.classList.add('transitioning');
        this.elActive.classList.add('transitioning');
        this.elNext.classList.add('transitioning');
        
        // Fade and scale transition for backward movement
        this.elPrev.style.opacity = '0';
        this.elActive.style.opacity = '0';
        this.elNext.style.opacity = '0';
        this.elPrev.style.transform = 'translateY(-10px) scale(0.95)';
        this.elActive.style.transform = 'translateY(-10px) scale(0.95)';
        this.elNext.style.transform = 'translateY(-10px) scale(0.95)';
        
        setTimeout(() => {
            // Update content
            this.elPrev.textContent = prevSegment ? prevSegment.text : '';
            this.elActive.textContent = currentSegment ? currentSegment.text : '';
            this.elNext.textContent = nextSegment ? nextSegment.text : '';
            
            // Fade and scale back in
            this.elPrev.style.opacity = '';
            this.elActive.style.opacity = '';
            this.elNext.style.opacity = '';
            this.elPrev.style.transform = '';
            this.elActive.style.transform = '';
            this.elNext.style.transform = '';
            
            // Clean up transition classes
            setTimeout(() => {
                this.elPrev.classList.remove('transitioning');
                this.elActive.classList.remove('transitioning');
                this.elNext.classList.remove('transitioning');
            }, 300);
        }, 150);
    }

    seekToSegment(segmentIndex) {
        if (segmentIndex >= 0 && segmentIndex < this.segments.length) {
            this.audio.currentTime = this.segments[segmentIndex].start;
        }
    }

    // Mini Player Functionality
    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting && !this.audio.paused) {
                    this.showMiniPlayer();
                } else if (entry.isIntersecting && this.isMiniMode) {
                    this.hideMiniPlayer();
                }
            });
        }, options);

        this.observer.observe(this.container.querySelector('.audio-player-wrap'));
    }

    handleScroll() {
        const playerRect = this.container.getBoundingClientRect();
        const isPlayerVisible = playerRect.top < window.innerHeight && playerRect.bottom > 0;
        
        if (!isPlayerVisible && !this.audio.paused && !this.isMiniMode) {
            this.showMiniPlayer();
        } else if (isPlayerVisible && this.isMiniMode) {
            this.hideMiniPlayer();
        }
    }

    showMiniPlayer() {
        if (this.isMiniMode) return;
        
        this.isMiniMode = true;
        this.container.classList.add('mini-mode');
        this.miniPlayer.classList.add('show');
        
        // Add padding to body to prevent content jump
        document.body.style.paddingBottom = '70px';
    }

    hideMiniPlayer() {
        if (!this.isMiniMode) return;
        
        this.isMiniMode = false;
        this.container.classList.remove('mini-mode');
        this.miniPlayer.classList.remove('show');
        
        // Remove padding from body
        document.body.style.paddingBottom = '';
    }

    expandFromMini() {
        this.hideMiniPlayer();
        
        // Scroll to main player
        this.container.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }

    closeMiniPlayer() {
        this.hideMiniPlayer();
        this.audio.pause();
    }

    setupMobileProgressBar() {
        // Add click handler to the play-wrap element for mobile progress bar
        this.container.querySelector('.play-wrap').addEventListener('click', (e) => {
            // Only handle clicks on mobile devices and in the progress bar area
            if (window.innerWidth <= 768) {
                const playWrap = e.currentTarget;
                const rect = playWrap.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                
                // Check if click is in the progress bar area (top 30px of play-wrap)
                if (clickY <= 30 && clickY >= -25) {
                    const clickX = e.clientX - rect.left;
                    const progressWidth = rect.width * 0.8; // 80% width of play-wrap
                    const progressLeft = rect.width * 0.1; // 10% offset from left
                    
                    if (clickX >= progressLeft && clickX <= progressLeft + progressWidth) {
                        const percentage = (clickX - progressLeft) / progressWidth;
                        const newTime = percentage * this.audio.duration;
                        
                        if (isFinite(newTime)) {
                            this.audio.currentTime = newTime;
                        }
                        
                        // Prevent the click from bubbling to play button
                        e.stopPropagation();
                    }
                }
            }
        });
    }

    // Public API methods
    play() {
        this.audio.play();
    }

    pause() {
        this.audio.pause();
    }

    setVolume(volume) {
        this.audio.volume = Math.max(0, Math.min(1, volume));
        this.volumeSlider.value = this.audio.volume;
    }

    setTime(seconds) {
        this.audio.currentTime = seconds;
    }

    destroy() {
        this.audio.pause();
        this.container.innerHTML = '';
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SentraAudioPlayer;
}

// Global access
window.SentraAudioPlayer = SentraAudioPlayer;