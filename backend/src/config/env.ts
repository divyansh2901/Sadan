export function validateEnvironment(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === 'your-super-secret-key-here') {
    throw new Error('JWT_SECRET must be set to a unique value of at least 32 characters');
  }
}
