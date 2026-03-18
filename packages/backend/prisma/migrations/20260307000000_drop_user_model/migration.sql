-- DropForeignKey
ALTER TABLE "InterviewSession" DROP CONSTRAINT IF EXISTS "InterviewSession_userId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "User_email_key";

-- AlterTable
ALTER TABLE "InterviewSession" DROP COLUMN IF EXISTS "userId";

-- DropTable
DROP TABLE IF EXISTS "User";
