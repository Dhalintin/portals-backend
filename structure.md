**Revised focus: Per-PIN pricing sold as cards**

This is the most appealing and familiar model for Nigerian primary and secondary schools. Parents already know and accept buying a PIN/scratch card to check results (WAEC, NECO, many private schools). Schools love it because:

- Zero or very low fixed cost to the school
- Schools make a small margin on every PIN sold
- Cash-flow friendly (parents pay, not the school budget)
- Easy to administer and scale with student numbers

### Core MVP (still the smallest efficient version)

Everything stays tightly focused on **result checking via PIN cards**:

1. **Multi-tenant school portal**  
   School registers → gets its branded portal (subdomain or simple branded page). Logo, colours, school name.

2. **Student records**  
   Bulk Excel/CSV upload (admission number, name, class/arm). Simple management.

3. **Results engine (the heart)**  
   Teachers/admin enter CA + Exam scores.  
   Auto-calculate totals, percentages, positions, grades (configurable Nigerian scales).  
   Generate clean printable report cards.  
   Publish results for a term/session.

4. **PIN / Card system (key monetisation)**

   - School admin generates unique PINs in bulk (or you generate and supply).
   - Each PIN is single-use or limited-use for a specific term/result set.
   - Student/parent goes to the school portal, enters Admission Number + PIN → views and downloads results/report card.
   - Optional: simple login after first PIN use for convenience.
   - Track used/unused PINs in the school dashboard.

5. **Basic parent/student view + announcements**  
   Results page + simple notice board. Mobile-first and low-data.

No fees module, no attendance, no full SIS, no apps in the MVP. Just a professional, branded result-checking portal powered by PIN cards.

### How the PIN-card business model works for the school

- You sell PIN cards (physical scratch cards or digital codes) to the school at a wholesale rate (e.g. ₦100–₦200 per PIN).
- School sells them to parents at a retail price (e.g. ₦300–₦500 or whatever the school decides).
- School keeps the difference as pure profit + enjoys free professional result portal and report cards.
- Alternative: School pays you a small platform fee + buys PINs, or pure revenue-share on PIN sales.
- First term can be heavily discounted or free PINs so the school experiences the value with zero risk.

This removes the biggest objection (“we don’t have budget for software”) and turns the portal into a revenue generator for the school.

### Build stack (still zero/near-zero funds)

Same free-tier stack as before (Next.js + Supabase + Vercel). Add simple PIN generation and validation logic. Physical cards can start as printed lists or basic scratch cards from any local printer; later you can partner with a card printer.

### Marketing strategy focused on the PIN model (Lagos, Abuja, Port Harcourt, Enugu)

**Primary pitch to proprietors and principals:**

> “Stop spending weeks computing and printing results. Upload scores once, generate beautiful report cards, and sell PIN cards to parents. Your school looks modern, parents are happy, and you make money on every result checked — instead of paying for software.”

**Execution:**

- Direct school visits remain the highest-converting channel. Carry sample PIN cards and a live demo phone/laptop. Show the full flow: score entry → publish → parent checks with PIN in under 30 seconds.
- Offer the first 50–100 PINs free (or the entire first term) so the school can test with real parents and see the cash come in.
- WhatsApp is your main follow-up tool. Send short demo videos of the PIN-checking experience and screenshots of the school’s branded portal.
- Target private schools of 100–800 students first — they feel the result-processing pain most and already sell items to parents.
- Use early schools as proof: “School X sold 420 PINs in one week and kept ₦XXX profit while parents stopped calling the office.”
- Partner with local stationery shops, cybercafés, and printers who already supply schools — they can stock and promote your PIN cards.

**Positioning against competitors:**  
Full school management systems charge high fixed fees. You offer a familiar, low-risk PIN model that schools already understand, plus a clean modern portal at almost no cost to them.

This single change (per-PIN cards) makes the product far more sellable in the Nigerian private-school market because it aligns with existing parent behaviour and turns the software into a profit centre rather than a cost centre for the school.

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
