import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = 'Bintangfjr';
  const rawPassword = 'SuperPassword123';

  // Hash password
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  // Buat admin baru
  const admin = await prisma.admin.create({
    data: {
      nama_lengkap: 'Bintang Fajar',
      username: username,
      email: 'bintang@example.com', // ganti sesuai kebutuhan
      password: hashedPassword,
      is_super_admin: true, // bisa di-set true atau false
    },
  });

  console.log('Admin baru berhasil dibuat:', admin);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
