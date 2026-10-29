export type TeacherAssignmentPublic = {
  id: string;
  classId: string;
  className: string;
  classArm: string | null;
  classDisplayName: string;
  subjectId: string;
  subjectName: string;
};

export type TeacherPublic = {
  id: string; // userId
  membershipId: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "TEACHER" | "EXAM_OFFICER";
  roles?: import("@prisma/client").OrgRole[];
  isActive: boolean;
  joinedAt: Date;
  assignments: TeacherAssignmentPublic[];
  classTeacherOf: Array<any>;
};
