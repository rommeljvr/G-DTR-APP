import { User, Employee } from '../types';

const USER_KEY = 'dtr_user';

export function getStoredUser(): User | null {
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateUserEmployee(employee: Employee): void {
  const user = getStoredUser();
  if (user) {
    user.employee = employee;
    user.name = employee.name || user.name;
    storeUser(user);
  }
}

export function clearUser(): void {
  localStorage.removeItem(USER_KEY);
}
