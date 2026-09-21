import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ErrorState } from './ErrorState';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Lightweight screen-level error boundary. Any render error in the wrapped
 * content shows a friendly Dutch fallback with a retry button instead of a
 * blank white screen. Used inside AppScreen so every page is protected.
 *
 * Error boundaries must be class components. The fallback (ErrorState) is a
 * normal component, so it stays theme-aware.
 */
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    if (__DEV__) {
      console.log('[ScreenErrorBoundary] render error', {
        message: error.message,
        stack: info.componentStack,
      });
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.fallback}>
          <ErrorState
            title="Er ging iets mis"
            message="Er ging iets mis bij het laden van deze pagina."
            onRetry={this.reset}
            retryLabel="Opnieuw proberen"
          />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    flexGrow: 1,
    minHeight: 360,
    justifyContent: 'center',
  },
});
