import type { OnboardingRepository } from '@jpkrlove/api-client';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import {
  MemberStateRouteGate,
  onboardingRouteFromSegments,
} from './member-state-route-gate';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(MockText, null, `redirect:${href}`),
  };
});

function createRepository(
  ...memberStates: Awaited<
    ReturnType<OnboardingRepository['getCurrentState']>
  >['memberState'][]
): OnboardingRepository {
  const getCurrentState = jest.fn();
  for (const memberState of memberStates) {
    getCurrentState.mockResolvedValueOnce({
      memberState,
      profile: null,
      media: [],
    });
  }
  return {
    getCurrentState,
    redeemInvitation: jest.fn(),
    createIdentitySession: jest.fn(),
    uploadProfileMedia: jest.fn(),
    retryProfileMediaUpload: jest.fn(),
    reorderProfileMedia: jest.fn(),
    deleteProfileMedia: jest.fn(),
    refreshProfileMediaUrl: jest.fn(),
    saveProfileDraft: jest.fn(),
    submitProfile: jest.fn(),
  };
}

describe('MemberStateRouteGate', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['active', '/(onboarding)/profile', '/(app)'],
    ['active', '/(onboarding)/identity', '/(app)'],
    ['paused', '/(onboarding)/profile', '/(onboarding)/status'],
    ['paused', '/(onboarding)/identity', '/(onboarding)/status'],
    ['restricted', '/(onboarding)/profile', '/(onboarding)/status'],
    ['restricted', '/(onboarding)/identity', '/(onboarding)/status'],
    ['identity_pending', '/(onboarding)/profile', '/(onboarding)/identity'],
  ] as const)(
    'redirects %s away from a direct %s deep link',
    async (memberState, currentRoute, expectedRoute) => {
      const repository = createRepository(memberState);

      await render(
        <MemberStateRouteGate
          currentRoute={currentRoute}
          repository={repository}
        >
          <Text>allowed route</Text>
        </MemberStateRouteGate>,
      );

      expect(
        await screen.findByText(`redirect:${expectedRoute}`),
      ).toBeOnTheScreen();
      expect(screen.queryByText('allowed route')).not.toBeOnTheScreen();
    },
  );

  it('allows only the route assigned to the current member state', async () => {
    const repository = createRepository('changes_requested');

    await render(
      <MemberStateRouteGate
        currentRoute="/(onboarding)/profile"
        repository={repository}
      >
        <Text>allowed route</Text>
      </MemberStateRouteGate>,
    );

    expect(await screen.findByText('allowed route')).toBeOnTheScreen();
    expect(screen.queryByText(/^redirect:/)).not.toBeOnTheScreen();
  });

  it('refetches state on foreground and redirects after identity completion', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListener = listener as (state: string) => void;
        return { remove: jest.fn() };
      });
    const repository = createRepository('identity_pending', 'profile_draft');

    await render(
      <MemberStateRouteGate
        currentRoute="/(onboarding)/identity"
        repository={repository}
      >
        <Text>identity route</Text>
      </MemberStateRouteGate>,
    );
    expect(await screen.findByText('identity route')).toBeOnTheScreen();

    await act(async () => appStateListener?.('active'));

    await waitFor(() =>
      expect(repository.getCurrentState).toHaveBeenCalledTimes(2),
    );
    expect(
      await screen.findByText('redirect:/(onboarding)/profile'),
    ).toBeOnTheScreen();
  });

  it('fails closed when foreground state revalidation is unavailable', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListener = listener as (state: string) => void;
        return { remove: jest.fn() };
      });
    const repository = createRepository('profile_draft');
    jest
      .mocked(repository.getCurrentState)
      .mockRejectedValueOnce(new Error('offline'));

    await render(
      <MemberStateRouteGate
        currentRoute="/(onboarding)/profile"
        repository={repository}
      >
        <Text>profile editor</Text>
      </MemberStateRouteGate>,
    );
    expect(await screen.findByText('profile editor')).toBeOnTheScreen();

    await act(async () => appStateListener?.('active'));

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByText('profile editor')).not.toBeOnTheScreen();
  });

  it('derives the guarded route from Expo Router segments', () => {
    expect(onboardingRouteFromSegments(['(onboarding)', 'profile'])).toBe(
      '/(onboarding)/profile',
    );
    expect(onboardingRouteFromSegments(['identity', 'callback'])).toBeNull();
  });
});
