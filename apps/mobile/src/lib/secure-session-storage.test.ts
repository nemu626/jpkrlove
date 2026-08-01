import { createSecureSessionStorage } from './secure-session-storage';

describe('secure session storage', () => {
  it('delegates auth tokens only to the injected SecureStore boundary', async () => {
    const secureStore = {
      getItemAsync: jest.fn().mockResolvedValue('stored-session'),
      setItemAsync: jest.fn().mockResolvedValue(undefined),
      deleteItemAsync: jest.fn().mockResolvedValue(undefined),
    };
    const storage = createSecureSessionStorage(secureStore);

    await expect(storage.getItem('auth.session')).resolves.toBe(
      'stored-session',
    );
    await storage.setItem('auth.session', 'new-session');
    await storage.removeItem('auth.session');

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'auth.session',
      'new-session',
      expect.objectContaining({ keychainService: 'jpkrlove.auth' }),
    );
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      'auth.session',
      expect.objectContaining({ keychainService: 'jpkrlove.auth' }),
    );
  });
});
