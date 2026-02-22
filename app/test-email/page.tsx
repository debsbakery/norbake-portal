'use client';

export default function TestEmail() {
  const sendTest = async () => {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'debs_bakery@outlook.com',
        subject: 'Test Email from Production',
        html: '<h1>This is a test</h1><p>If you receive this, email is working!</p>',
      }),
    });

    const result = await response.json();
    alert(JSON.stringify(result, null, 2));
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Email Test</h1>
      <button 
        onClick={sendTest}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Send Test Email
      </button>
    </div>
  );
}