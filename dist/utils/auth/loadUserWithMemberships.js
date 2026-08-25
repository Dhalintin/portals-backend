"use strict";
async function loadUserWithMemberships(email) {
    return prisma.user.findUnique({
        where: { email },
        include: {
            memberships: {
                where: { isActive: true },
                include: { organization: true },
            },
        },
    });
}
