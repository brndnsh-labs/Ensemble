import { Component, h, render } from 'preact';
import { App } from './App.jsx';

class ErrorBoundary extends Component {
    constructor() {
        super();
        this.state = { errored: false };
    }
    componentDidCatch(error) {
        this.setState({ errored: true });
        console.error('[UI-Root] Component Crash:', error);
    }
    render(props, state) {
        if (state.errored) {
            return (
                <div style="padding: 2rem; text-align: center; background: #1e293b; color: white; height: 100vh;">
                    <h2>Something went wrong in the UI.</h2>
                    <p>The audio engine may still be running. Try refreshing.</p>
                    <button onClick={() => window.location.reload()} class="primary-btn">
                        Refresh App
                    </button>
                </div>
            );
        }
        return props.children;
    }
}

export function mountComponents(getVisualTime) {
    console.log('[UI-Root] Mounting Preact Root...');

    const root = document.body;

    render(
        <ErrorBoundary>
            <App getVisualTime={getVisualTime} />
        </ErrorBoundary>,
        root,
    );
}
