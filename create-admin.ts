// create-admin.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  const password = 'password123'; // password baru admin
  const hashedPassword = await bcrypt.hash(password, 10); // hash bcrypt

  const newAdmin = await prisma.admin.create({
    data: {
      nama_lengkap: 'Bintang Admin',
      username: 'bintangadmin',
      email: 'bintang@rentalmotor.com',
      password: hashedPassword,
      is_super_admin: true, // 1 = super admin
    },
  });

  console.log('✅ Admin created:', newAdmin);
}

createAdmin()
  .catch((err) => console.error(err))
  .finally(() => prisma.$disconnect());
