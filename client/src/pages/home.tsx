import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Home() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      // Redirect based on role
      if (user.role === 'admin') {
        setLocation('/admin/schedule');
      } else if (user.role === 'coach') {
        setLocation('/coach');
      }
      // Students stay on home page
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary">載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <i className="fas fa-swimming-pool text-primary text-2xl"></i>
              <h1 className="text-xl font-bold text-primary">五泳池課表整合系統</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <i className="fas fa-user text-primary-foreground text-sm"></i>
                </div>
                <span className="text-sm font-medium">{user?.firstName || user?.email || '用戶'}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/api/logout'}
                data-testid="button-logout"
              >
                登出
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {user?.role === 'admin' && (
            <>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/statistics')}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <i className="fas fa-chart-bar text-primary"></i>
                    <span>堂數統計</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    教練課堂統計與報表匯出功能
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {user?.role === 'coach' && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation('/coach')}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <i className="fas fa-user-clock text-primary"></i>
                  <span>我的課表</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  查看本週課程安排與場館分布
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <i className="fas fa-search text-primary"></i>
                <span>課表查詢</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                查詢各場館的課程安排
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
