import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function OnboardingScreen({
  title,
  description,
  children,
  footer,
}: PropsWithChildren<{
  title: string;
  description?: string;
  footer?: ReactNode;
}>) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {description ? (
              <Text style={styles.description}>{description}</Text>
            ) : null}
          </View>
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const onboardingStyles = StyleSheet.create({
  label: {
    color: '#25282A',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#8B9194',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#25282A',
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  field: {
    gap: 6,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#C84F5A',
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#176B66',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#176B66',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: '#A32833',
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: '#176B66',
    fontSize: 14,
    lineHeight: 20,
  },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9F8' },
  fill: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 28,
  },
  heading: { gap: 10 },
  title: {
    color: '#25282A',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: 0,
  },
  description: {
    color: '#5D6366',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
  },
  body: { gap: 18 },
  footer: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D8DCDA',
  },
});
