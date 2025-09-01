import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface PasswordProtectProps {
  children: React.ReactNode;
  requiredPassword?: string;
}

export default function PasswordProtect({ children, requiredPassword = "dream28559983" }: PasswordProtectProps) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check if already authorized in this session
    const stored = sessionStorage.getItem("admin_authorized");
    if (stored === "true") {
      setIsAuthorized(true);
    }
    setIsLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === requiredPassword) {
      setIsAuthorized(true);
      sessionStorage.setItem("admin_authorized", "true");
      toast({
        title: "驗證成功",
        description: "歡迎使用管理功能",
      });
    } else {
      toast({
        title: "密碼錯誤",
        description: "請輸入正確的管理密碼",
        variant: "destructive",
      });
      setPassword("");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">管理功能驗證</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="password"
                  placeholder="請輸入管理密碼"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-password"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full"
                data-testid="button-submit"
              >
                驗證
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}