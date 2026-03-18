/*
  Warnings:

  - You are about to drop the column `starterCode` on the `Question` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Question" DROP COLUMN "starterCode";

-- CreateTable
CREATE TABLE "StarterCode" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "StarterCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StarterCode_questionId_language_key" ON "StarterCode"("questionId", "language");

-- AddForeignKey
ALTER TABLE "StarterCode" ADD CONSTRAINT "StarterCode_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
