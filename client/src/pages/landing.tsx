import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <i className="fas fa-swimming-pool text-primary-foreground text-2xl"></i>
          </div>
          <CardTitle className="text-2xl font-bold text-primary">
            五泳池課表整合系統
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            專業的游泳課程排程管理平台
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={() => window.location.href = '/api/login'}
            className="w-full"
            data-testid="button-login"
          >
            <i className="fas fa-sign-in-alt mr-2"></i>
            登入系統
          </Button>
          <div className="text-xs text-muted-foreground text-center">
            支援管理員、教練及學生家長三種身份
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
