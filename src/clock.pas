program Clock;

{ Analog clock demo using the BGI graphics unit (Graph), Crt (KeyPressed/
  Delay) and Dos (GetTime). Updates once a second. Press any key to quit.

  Flicker-free without true hardware double buffering: the face is drawn
  once and never touched again; each tick erases only the previous hand
  lines (redrawing them in black) before drawing the new ones, instead of
  clearing and redrawing the whole screen. BGI has no portable way to
  render to an off-screen bitmap, and classic VGA 640x480x16 (the mode
  InitGraph picks here) only has one real hardware page to flip to, so
  SetActivePage/SetVisualPage page-flipping isn't a reliable option. }

uses Crt, Dos, Graph;

const
  TickCount = 12;

var
  GraphDriver, GraphMode, ErrorCode: Integer;
  CenterX, CenterY, FaceRadius: Integer;
  Hour, Minute, Second, Hundredths: Word;
  LastSecond: Integer;
  HaveHands: Boolean;
  PrevHourX, PrevHourY, PrevMinuteX, PrevMinuteY, PrevSecondX, PrevSecondY: Integer;

procedure InitGraphics;
begin
  GraphDriver := Detect;
  InitGraph(GraphDriver, GraphMode, '');
  ErrorCode := GraphResult;
  if ErrorCode <> grOk then
  begin
    WriteLn('Graphics init failed: ', GraphErrorMsg(ErrorCode));
    Halt(1);
  end;
  CenterX := GetMaxX div 2;
  CenterY := GetMaxY div 2;
  if CenterX < CenterY then
    FaceRadius := CenterX - 20
  else
    FaceRadius := CenterY - 20;

  SetLineStyle(SolidLn, 0, ThickWidth);
end;

{ Theta is measured clockwise from 12 o'clock, in radians. }
procedure HandPoint(Theta: Real; Len: Integer; var X, Y: Integer);
begin
  X := CenterX + Round(Len * Sin(Theta));
  Y := CenterY - Round(Len * Cos(Theta));
end;

procedure DrawFace;
var
  i: Integer;
  Theta: Real;
  X1, Y1, X2, Y2: Integer;
begin
  SetColor(White);
  Circle(CenterX, CenterY, FaceRadius);
  for i := 0 to TickCount - 1 do
  begin
    Theta := i * (2 * Pi / TickCount);
    HandPoint(Theta, FaceRadius, X1, Y1);
    HandPoint(Theta, FaceRadius - 10, X2, Y2);
    Line(X1, Y1, X2, Y2);
  end;
  Circle(CenterX, CenterY, 3);
end;

procedure EraseHands;
begin
  if not HaveHands then Exit;
  SetColor(Black);
  Line(CenterX, CenterY, PrevHourX, PrevHourY);
  Line(CenterX, CenterY, PrevMinuteX, PrevMinuteY);
  Line(CenterX, CenterY, PrevSecondX, PrevSecondY);
end;

procedure DrawHands;
var
  HourTheta, MinuteTheta, SecondTheta: Real;
  HandX, HandY: Integer;
begin
  HourTheta := (Hour mod 12 + Minute / 60.0) * (2 * Pi / 12);
  MinuteTheta := (Minute + Second / 60.0) * (2 * Pi / 60);
  SecondTheta := Second * (2 * Pi / 60);

  SetColor(White);
  HandPoint(HourTheta, Round(FaceRadius * 0.5), HandX, HandY);
  Line(CenterX, CenterY, HandX, HandY);
  PrevHourX := HandX;
  PrevHourY := HandY;

  HandPoint(MinuteTheta, Round(FaceRadius * 0.8), HandX, HandY);
  Line(CenterX, CenterY, HandX, HandY);
  PrevMinuteX := HandX;
  PrevMinuteY := HandY;

  SetColor(LightRed);
  HandPoint(SecondTheta, Round(FaceRadius * 0.9), HandX, HandY);
  Line(CenterX, CenterY, HandX, HandY);
  PrevSecondX := HandX;
  PrevSecondY := HandY;

  HaveHands := True;
end;

procedure WaitTick;
var
  i: Integer;
begin
  for i := 1 to 10 do
  begin
    if KeyPressed then Exit;
    Delay(100);
  end;
end;

begin
  InitGraphics;
  DrawFace;
  HaveHands := False;
  LastSecond := -1;
  repeat
    GetTime(Hour, Minute, Second, Hundredths);
    if Second <> LastSecond then
    begin
      EraseHands;
      DrawHands;
      LastSecond := Second;
    end;
    WaitTick;
  until KeyPressed;
  CloseGraph;
end.
