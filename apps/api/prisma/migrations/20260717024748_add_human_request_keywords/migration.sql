-- AlterTable
ALTER TABLE "eva_configs" ADD COLUMN     "human_request_keywords" TEXT[] DEFAULT ARRAY['转人工', '人工', 'human', 'agent', 'manusia']::TEXT[];
