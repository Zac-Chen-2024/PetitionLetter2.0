'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { projectApi } from '@/utils/api';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function redirectToWorkspace() {
      try {
        const projects = await projectApi.listProjects();
        if (projects && projects.length > 0) {
          // Redirect to the most recently updated project
          const sortedProjects = [...projects].sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          router.replace(`/workspace/${sortedProjects[0].id}`);
        } else {
          // No projects, create one and redirect
          const newProject = await projectApi.createProject('New Project');
          router.replace(`/workspace/${newProject.id}`);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
        // Fallback: show loading state
      }
    }

    redirectToWorkspace();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading workspace...</p>
      </div>
    </div>
  );
}
