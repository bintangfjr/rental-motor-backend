// createAdmin.js
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    const password = 'Bintang123'; // Ganti dengan password yang diinginkan
    const hashedPassword = await bcrypt.hash(password, 10);

    // Cek apakah admin sudah ada
    const existingAdmin = await prisma.admin.findUnique({
      where: { username: 'Bintangfjr' },
    });

    if (existingAdmin) {
      console.log('❌ Admin dengan username Bintangfjr sudah ada!');
      return;
    }

    // Buat admin baru
    const admin = await prisma.admin.create({
      data: {
        nama_lengkap: 'Bintang FJR',
        username: 'Bintangfjr',
        email: 'bintang@mitrabersamaa.com',
        password: hashedPassword,
        is_super_admin: true,
      },
    });

    console.log('✅ Super Admin created successfully!');
    console.log('======================');
    console.log('Username: Bintangfjr');
    console.log('Email: bintang@mitrabersamaa.com');
    console.log('Password: Bintang123');
    console.log('Role: Super Admin');
    console.log('======================');
    console.log('Simpan informasi login ini dengan aman!');
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
