export function useAuth() {
  return {
    user: null as null | { name: string; firstName: string; email: string },
    isAuthenticated: false,
    isLoading: false,
    login: () => {},
    logout: () => {},
  };
}
