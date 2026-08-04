school-portal-backend/
├── prisma/
│ ├── schema.prisma
│ └── seed.ts # optional
├── src/
│ ├── config/
│ │ └── env.ts
│ ├── lib/
│ │ └── prisma.ts # Prisma client singleton
│ ├── middleware/
│ │ ├── auth.ts
│ │ ├── errorHandler.ts
│ │ └── tenant.ts # school context
│ ├── modules/
│ │ ├── auth/
│ │ ├── schools/
│ │ ├── students/
│ │ ├── results/
│ │ ├── pins/
│ │ └── announcements/
│ ├── utils/
│ │ ├── generatePin.ts
│ │ └── calculateResults.ts
│ ├── app.ts
│ └── server.ts
├── .env
├── .env.example
├── package.json
└── tsconfig.json
