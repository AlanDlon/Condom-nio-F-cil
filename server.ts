import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import admin from "firebase-admin";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { addHours, subHours, startOfDay, endOfDay } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "gen-lang-client-0617354751"
  });
}

const db = admin.firestore();
const fcm = admin.messaging();

// Cron job to send payment reminders 48 hours before due date
// Runs every day at 08:00
cron.schedule("0 8 * * *", async () => {
  console.log("Running payment reminder cron job...");
  const today = new Date();
  const targetDate = addHours(today, 48);
  const startOfTarget = startOfDay(targetDate).toISOString();
  const endOfTarget = endOfDay(targetDate).toISOString();

  try {
    const invoicesSnapshot = await db.collection("invoices")
      .where("status", "==", "pending")
      .where("dueDate", ">=", startOfTarget)
      .where("dueDate", "<=", endOfTarget)
      .get();

    if (invoicesSnapshot.empty) {
      console.log("No invoices due in 48 hours.");
      return;
    }

    for (const doc of invoicesSnapshot.docs) {
      const invoice = doc.data();
      const userId = invoice.userId;
      
      // Fetch user's FCM tokens
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      
      if (userData && userData.fcmTokens && userData.fcmTokens.length > 0) {
        const message = {
          notification: {
            title: "Lembrete de Pagamento",
            body: `Sua fatura de R$ ${invoice.amount.toFixed(2)} vence em 48 horas.`,
          },
          tokens: userData.fcmTokens,
        };

        const response = await fcm.sendEachForMulticast(message);
        console.log(`Sent ${response.successCount} notifications for invoice ${doc.id}`);
      }
    }
  } catch (error) {
    console.error("Error in cron job:", error);
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API: Cálculo de Juros
  app.post("/api/calculate-interest", (req, res) => {
    const { amount, dueDate } = req.body;
    const today = new Date();
    const due = new Date(dueDate);
    
    if (today > due) {
      const diffTime = Math.abs(today.getTime() - due.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Simulação: 2% multa + 0.033% juros ao dia
      const penalty = amount * 0.02;
      const dailyInterest = amount * 0.00033 * diffDays;
      const total = amount + penalty + dailyInterest;
      
      return res.json({ 
        originalAmount: amount,
        penalty,
        dailyInterest,
        total,
        daysLate: diffDays
      });
    }
    
    res.json({ total: amount, daysLate: 0 });
  });

  // API: Simulação de Pagamento Pix
  app.post("/api/generate-pix", (req, res) => {
    const { invoiceId, amount } = req.body;
    // Simulação de payload Pix Copia e Cola
    const pixCode = `00020101021226850014br.gov.bcb.pix0136${invoiceId}-condo-premium-5204000053039865405${amount.toFixed(2)}5802BR5920CondoPremium6009SaoPaulo62070503***6304D1E2`;
    res.json({ pixCode });
  });

  // API: Simulação de Boleto Bancário
  app.post("/api/generate-boleto", (req, res) => {
    const { invoiceId, amount } = req.body;
    // Simulação de linha digitável de boleto
    const boletoCode = `23793.38128 60087.003485 11000.000204 7 964300000${Math.round(amount * 100)}`;
    res.json({ boletoCode });
  });

  // API: Update Bank Account for Automatic Debit
  app.post("/api/update-bank-account", async (req, res) => {
    const { userId, bankAccount } = req.body;
    if (!userId || !bankAccount) return res.status(400).json({ error: "Missing userId or bankAccount" });

    try {
      await db.collection("users").doc(userId).update({
        bankAccount: bankAccount
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating bank account:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Register FCM Token
  app.post("/api/register-fcm-token", async (req, res) => {
    const { userId, token } = req.body;
    if (!userId || !token) return res.status(400).json({ error: "Missing userId or token" });

    try {
      await db.collection("users").doc(userId).update({
        fcmTokens: admin.firestore.FieldValue.arrayUnion(token)
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error registering FCM token:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Send Verification Email (Admin trigger)
  app.post("/api/send-verification-email", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    try {
      const userRecord = await admin.auth().getUser(userId);
      if (userRecord.emailVerified) {
        return res.status(400).json({ error: "User already verified" });
      }

      const link = await admin.auth().generateEmailVerificationLink(userRecord.email!);
      
      // In a real app, you'd send this link via an email service (SendGrid, etc.)
      // For this demo, we'll simulate it and log it.
      console.log(`Verification link for ${userRecord.email}: ${link}`);
      
      res.json({ success: true, message: "Link de verificação gerado (simulado)." });
    } catch (error: any) {
      console.error("Error generating verification link:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
