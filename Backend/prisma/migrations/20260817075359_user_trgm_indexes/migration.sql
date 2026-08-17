-- CreateIndex
CREATE INDEX "User_fullName_idx" ON "User" USING GIN ("fullName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User" USING GIN ("phone" gin_trgm_ops);

