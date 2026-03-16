export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mk-bg flex flex-col">
      {children}
    </div>
  );
}
