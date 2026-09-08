import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";

export function EventCreatePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create Event" description="Feature 1 — Event Request Creation" />
      <Card>
        <CardBody className="py-16 text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Create Event — Coming Soon
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This flow is being rebuilt against the real API. Check back soon.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
