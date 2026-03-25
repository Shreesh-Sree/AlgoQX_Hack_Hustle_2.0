export function useAuth() {
  return {
    user: null as null | { name: string; email: string },
    isAuthenticated: false,
    isLoading: false,
    login: () => {},
    logout: () => {},
  };
}
