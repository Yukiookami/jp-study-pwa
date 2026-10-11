-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "memo" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "importedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expression" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Expression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vocabulary" (
    "id" TEXT NOT NULL,
    "japanese" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,

    CONSTRAINT "Vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonWord" (
    "lessonId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LessonWord_pkey" PRIMARY KEY ("lessonId","vocabularyId")
);

-- CreateTable
CREATE TABLE "ExpressionWord" (
    "expressionId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,

    CONSTRAINT "ExpressionWord_pkey" PRIMARY KEY ("expressionId","vocabularyId")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" UUID NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "expressionId" TEXT,
    "vocabularyId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" UUID NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expressionId" TEXT,
    "vocabularyId" TEXT,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","itemType","itemId")
);

-- CreateTable
CREATE TABLE "ReviewState" (
    "userId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "lastRating" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "dueAt" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReviewState_pkey" PRIMARY KEY ("userId","cardId")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "rating" TEXT NOT NULL,
    "answeredAt" TIMESTAMPTZ NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" UUID NOT NULL,
    "algorithmVersion" INTEGER NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "userId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("userId","cardId")
);

-- CreateIndex
CREATE INDEX "Expression_lessonId_active_idx" ON "Expression"("lessonId", "active");

-- CreateIndex
CREATE INDEX "LessonWord_vocabularyId_active_idx" ON "LessonWord"("vocabularyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Card_itemType_itemId_cardType_key" ON "Card"("itemType", "itemId", "cardType");

-- CreateIndex
CREATE INDEX "ReviewState_userId_dueAt_idx" ON "ReviewState"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewEvent_sequence_key" ON "ReviewEvent"("sequence");

-- CreateIndex
CREATE INDEX "ReviewEvent_userId_receivedAt_idx" ON "ReviewEvent"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "Allocation_userId_day_idx" ON "Allocation"("userId", "day");

-- AddForeignKey
ALTER TABLE "Expression" ADD CONSTRAINT "Expression_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonWord" ADD CONSTRAINT "LessonWord_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonWord" ADD CONSTRAINT "LessonWord_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionWord" ADD CONSTRAINT "ExpressionWord_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionWord" ADD CONSTRAINT "ExpressionWord_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_expressionId_fkey" FOREIGN KEY ("expressionId") REFERENCES "Expression"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewState" ADD CONSTRAINT "ReviewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewState" ADD CONSTRAINT "ReviewState_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
