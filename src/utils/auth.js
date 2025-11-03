export async function getUserIdFromMe() {
  const response = await fetch('/api/me', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch user data');
  }
  const userData = await response.json();
  return userData.id;
} 