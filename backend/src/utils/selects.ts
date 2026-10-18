export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export const publicStudentUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
} as const;

export const safeStaffInclude = {
  user: { select: publicStudentUserSelect },
} as const;
