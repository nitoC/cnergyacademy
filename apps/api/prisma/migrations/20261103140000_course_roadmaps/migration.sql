-- AlterEnum
ALTER TYPE "RoadmapNodeType" ADD VALUE 'MODULE';

-- AlterTable
ALTER TABLE "Roadmap" ADD COLUMN     "courseId" UUID;

-- AlterTable
ALTER TABLE "RoadmapNode" ADD COLUMN     "moduleId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Roadmap_courseId_key" ON "Roadmap"("courseId");

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapNode" ADD CONSTRAINT "RoadmapNode_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

