program Clock;

{ Analog clock demo using the BGI graphics unit (Graph), Crt (Delay) and
  Dos (GetTime). Redraws at roughly 30 frames/second, sweeping the hands
  smoothly. GetTime's Hundredths field alone isn't enough for that - it's
  itself derived from the PC's ~18.2Hz BIOS timer tick, so it only
  actually changes about every 55ms no matter how often we redraw. To
  fill in the gap, TickFraction reads the 8253 timer chip's countdown
  counter directly (a simple, standard, read-only I/O port access - this
  doesn't reprogram the timer, so it has no effect on Delay() or anything
  else) to find out how far we are into the current tick, giving smooth
  sub-tick motion. Press any key to quit.

  Flicker-free without true hardware double buffering: the face is drawn
  once and never touched again; each frame erases only the previous hand
  lines (redrawing them in black) before drawing the new ones, instead of
  clearing and redrawing the whole screen. BGI has no portable way to
  render to an off-screen bitmap, and classic VGA 640x480x16 (the mode
  InitGraph picks here) only has one real hardware page to flip to, so
  SetActivePage/SetVisualPage page-flipping isn't a reliable option. }

uses Crt, Dos, Graph;

const
  TickCount = 12;
  FrameDelayMs = 33; { ~30 frames/second }
  PitHz = 1193182.0 / 65536.0; { the PC's standard 8253 timer tick rate, ~18.2065Hz }

var
  GraphDriver, GraphMode, ErrorCode: Integer;
  CenterX, CenterY, FaceRadius: Integer;
  Hour, Minute, Second, Hundredths: Word;
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

{ How far (0.0 to 1.0) we are into the 8253 timer's current countdown,
  which wraps once per BIOS tick (~54.9ms) - see the header comment. }
function TickFraction: Real;
var
  Lo, Hi: Byte;
  Count: Word;
begin
  Port[$43] := $00; { latch channel 0's current count }
  Lo := Port[$40];
  Hi := Port[$40];
  Count := Hi * 256 + Lo;
  TickFraction := (65536 - Count) / 65536.0;
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
  FracSecond, HourTheta, MinuteTheta, SecondTheta: Real;
  HandX, HandY: Integer;
begin
  FracSecond := Second + Hundredths / 100.0 + TickFraction / PitHz;
  HourTheta := (Hour mod 12 + (Minute + FracSecond / 60.0) / 60.0) * (2 * Pi / 12);
  MinuteTheta := (Minute + FracSecond / 60.0) * (2 * Pi / 60);
  SecondTheta := FracSecond * (2 * Pi / 60);

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

begin
  InitGraphics;
  DrawFace;
  HaveHands := False;
  repeat
    GetTime(Hour, Minute, Second, Hundredths);
    EraseHands;
    DrawHands;
    Delay(FrameDelayMs);
  until KeyPressed;
  CloseGraph;
end.
