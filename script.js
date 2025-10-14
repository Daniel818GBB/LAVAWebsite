// Main JavaScript file for Azure Static Web App

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Azure Static Web App loaded successfully!');

    // CTA Button interaction
    const ctaButton = document.getElementById('cta-button');
    if (ctaButton) {
        ctaButton.addEventListener('click', function() {
            // Open chat when CTA button is clicked
            const chatBox = document.getElementById('chat-box');
            const toggleBtn = document.getElementById('chat-toggle');
            if (chatBox && toggleBtn) {
                chatBox.style.display = 'block';
                toggleBtn.setAttribute('aria-expanded', 'true');
                toggleBtn.setAttribute('aria-label', 'Close chat');
            }
        });
    }

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add a simple animation on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all sections
    document.querySelectorAll('.section').forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });

    // ===== CHAT BUTTON LOGIC =====
    const toggleBtn = document.getElementById('chat-toggle');
    const chatBox = document.getElementById('chat-box');
    const closeBtn = document.getElementById('chat-close');
    const restartBtn = document.getElementById('chat-restart');

    if (toggleBtn && chatBox) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = chatBox.style.display === 'block';
            chatBox.style.display = isVisible ? 'none' : 'block';
            toggleBtn.setAttribute('aria-expanded', String(!isVisible));
            toggleBtn.setAttribute('aria-label', isVisible ? 'Open chat' : 'Close chat');
        });
    }

    if (closeBtn && chatBox && toggleBtn) {
        closeBtn.addEventListener('click', () => {
            chatBox.style.display = 'none';
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('aria-label', 'Open chat');
        });
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            if (window.chatObserver) {
                window.chatObserver.disconnect();
                window.chatObserver = null;
            }
            if (window.chatDirectLine) {
                try {
                    window.chatDirectLine.end();
                } catch (e) {
                    console.log('DirectLine already ended');
                }
                window.chatDirectLine = null;
            }
            const webchatElement = document.getElementById('webchat');
            if (webchatElement) {
                webchatElement.innerHTML = '';
                startWebChat();
            }
        });
    }

    // Initialize chat when page loads
    startWebChat();
});

// ===== WEBCHAT INITIALIZATION =====
let pendingScroll = false;
let isUserTurn = false;

function startWebChat() {
    (async function () {
        const styleOptions = {
            hideUploadButton: true,
            backgroundColor: "#fff",
            bubbleBackground: "#f0f4ff",
            bubbleTextColor: "#333",
            bubbleBorderRadius: 14,
            fontFamily: "'Montserrat', Arial, sans-serif",
            sendBoxBackground: "#fff",
            sendBoxTextColor: "#333",
            sendBoxButtonColor: "#0f9d58",
            accent: "#0f9d58",
            botAvatarBackgroundColor: "#0f9d58",
            botAvatarInitials: "MC",
            userAvatarInitials: "You",
            sendBoxHeight: 48,
            sendBoxBorderTop: "1px solid #e0e0e0",
            paddingBottom: 12
        };

        const tokenEndpointURL = new URL('https://c8ab89428f6be002b5247b562aa5f2.19.environment.api.powerplatform.com/powervirtualagents/botsbyschema/cra6f_masterIvr/directline/token?api-version=2022-03-01-preview');
        const locale = document.documentElement.lang || 'en';
        const apiVersion = tokenEndpointURL.searchParams.get('api-version');

        const [directLineURL, token] = await Promise.all([
            fetch(new URL(`/powervirtualagents/regionalchannelsettings?api-version=${apiVersion}`, tokenEndpointURL))
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to retrieve regional channel settings.');
                    }
                    return response.json();
                })
                .then(({ channelUrlsById: { directline } }) => directline),
            fetch(tokenEndpointURL)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Failed to retrieve Direct Line token.');
                    }
                    return response.json();
                })
                .then(({ token }) => token)
        ]);

        const directLine = window.WebChat.createDirectLine({ domain: new URL('v3/directline', directLineURL), token });
        window.chatDirectLine = directLine;

        const store = window.WebChat.createStore(
            {},
            ({ dispatch }) => next => action => {
                const result = next(action);
                
                if (action.type === 'WEB_CHAT/SEND_MESSAGE') {
                    isUserTurn = true;
                } else if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
                    const activity = action.payload.activity;
                    if (activity.from && activity.from.role === 'bot' && activity.type === 'message' && isUserTurn) {
                        pendingScroll = true;
                        isUserTurn = false;
                    }
                }
                
                return result;
            }
        );

        const subscription = directLine.connectionStatus$.subscribe({
            next(value) {
                if (value === 2) {
                    directLine
                        .postActivity({
                            localTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            locale,
                            name: 'startConversation',
                            type: 'event'
                        })
                        .subscribe();
                    subscription.unsubscribe();
                }
            }
        });

        window.WebChat.renderWebChat({
            directLine,
            locale,
            styleOptions,
            store
        }, document.getElementById('webchat'));

        setTimeout(() => {
            setupScrollingObserver();
        }, 1000);
    })();
}

function setupScrollingObserver() {
    const webchatElement = document.getElementById('webchat');
    if (!webchatElement) return;

    if (window.chatObserver) {
        window.chatObserver.disconnect();
    }

    window.chatObserver = new MutationObserver((mutations) => {
        if (!pendingScroll) return;

        const hasNewActivity = mutations.some(mutation =>
            mutation.type === 'childList' &&
            mutation.addedNodes.length > 0 &&
            Array.from(mutation.addedNodes).some(node =>
                node.nodeType === 1 && (
                    node.hasAttribute?.('data-testid') ||
                    node.className?.includes?.('webchat') ||
                    node.tagName === 'DIV'
                )
            )
        );

        if (hasNewActivity) {
            clearTimeout(window.scrollTimeout);
            window.scrollTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                    performOptimizedScroll();
                    pendingScroll = false;
                });
            }, 200);
        }
    });

    window.chatObserver.observe(webchatElement, {
        childList: true,
        subtree: true
    });
}

function performOptimizedScroll() {
    const webchatElement = document.getElementById('webchat');
    if (!webchatElement) return;

    const transcriptElement = webchatElement.querySelector('[role="log"]') ||
                              webchatElement.querySelector('.webchat__transcript') ||
                              webchatElement.querySelector('[data-testid="transcript"]');
    
    if (!transcriptElement) return;

    const activities = transcriptElement.children;
    if (activities.length < 2) return;

    const userQuestion = activities[activities.length - 2];
    if (!userQuestion) return;

    const scrollPosition = userQuestion.offsetTop - 10;
    
    transcriptElement.scrollTop = scrollPosition;
}