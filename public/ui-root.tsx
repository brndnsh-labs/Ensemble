import type { ComponentChildren } from 'preact';
import { Component, render } from 'preact';
import { App } from './App.jsx';

interface ErrorBoundaryState {
    errored: boolean;
}

class ErrorBoundary extends Component<{ children: ComponentChildren }, ErrorBoundaryState> {
    state = { errored: false };

    componentDidCatch(error: unknown) {
        this.setState({ errored: true });
        console.error('[UI-Root] Component Crash:', error);
    }

    render() {
        if (this.state.errored) {
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
        return <>{this.props.children}</>;
    }
}

export function mountComponents(getVisualTime: () => number) {
    const root = document.body;

    render(
        <ErrorBoundary>
            <App getVisualTime={getVisualTime} />
        </ErrorBoundary>,
        root,
    );
}
