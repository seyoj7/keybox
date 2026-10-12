/*
HISTORY:
========
20091110 (AndersK)
	*Initial version
*/

#if (defined(_MSC_VER) && !defined(_DEBUG))
	#pragma comment(linker,"/opt:nowin98")
	#pragma comment(linker,"/ignore:4078")
	#pragma comment(linker,"/merge:.rdata=.text")
#endif

#include <windows.h>
#include <windowsX.h>
#include <commctrl.h>


#define NSISCALL __stdcall
typedef struct {
  LPVOID xxx1;//exec_flags_type *exec_flags;
  int (NSISCALL *ExecuteCodeSegment)(int, HWND);
  void (NSISCALL *validate_filename)(char *);
  int (NSISCALL *RegisterPluginCallback)(HMODULE,LPVOID);
} extra_parameters;

#define NSISMemAlloc(cb) GlobalAlloc(GPTR,(cb))
#define NSISMemFree(p) do{void*m=(void*)(p);if(m)GlobalFree(m);}while(0)


WNDPROC g_PBOrgProc;
UINT g_rangeTot;
int g_rangeLow;
int g_rangeHigh;
int g_lastLocalPercent;
int g_localPosition;
int g_stage;
HMODULE g_hThisDll;

static int Clamp(int value, int low, int high)
{
	return value < low ? low : (value > high ? high : value);
}

static int LocalPercent(int position)
{
	const int span = g_rangeHigh - g_rangeLow;
	return span > 0 ? Clamp((position - g_rangeLow) * 100 / span, 0, 100) : 0;
}

static void BeginNextStage()
{
	if (g_stage < 2)
		++g_stage;
	g_lastLocalPercent = 0;
	g_localPosition = g_rangeLow;
}

static int OverallPosition(int localPercent)
{
	return g_stage * 100 + Clamp(localPercent, 0, 100);
}

#define MakeChA(c) c
#define MakeChW(c) L##c
#define FixTitleAorW(ch_t,ch_sf,percent) do{\
	cch=SendMessage##ch_sf(hwndNSIS,WM_GETTEXT,++cch,(LPARAM)buf);\
	ch_t* p=&(((ch_t*)buf)[cch-1]);\
	if (*p==MakeCh##ch_sf('%')) \
	{\
		while(*p!=MakeCh##ch_sf(' '))--p;\
	}\
	else\
		++p;\
	wsprintf##ch_sf(p,MakeCh##ch_sf(" %u%%"),percent);\
	SendMessage##ch_sf(hwndNSIS,WM_SETTEXT,0,(LPARAM)buf);\
	}while(0)

LRESULT CALLBACK PBSubProc(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp) 
{
	const BOOL isU=IsWindowUnicode(hwnd);
	//static int first=true;if(first && !--first)MessageBoxA(GetParent(GetParent(hwnd)),isU?"W":"A",0,0);

	switch(msg) 
	{
	case PBM_SETRANGE:
		{
			const int low = (short)LOWORD(lp);
			const int high = (short)HIWORD(lp);
			if (g_lastLocalPercent >= 90)
				BeginNextStage();
			g_rangeLow = low;
			g_rangeHigh = high;
			g_lastLocalPercent = 0;
			return isU ? CallWindowProcW(g_PBOrgProc, hwnd, PBM_SETRANGE32, 0, 300)
				: CallWindowProcA(g_PBOrgProc, hwnd, PBM_SETRANGE32, 0, 300);
		}
	case PBM_SETRANGE32:
		if (g_lastLocalPercent >= 90)
			BeginNextStage();
		g_rangeLow = (int)wp;
		g_rangeHigh = (int)lp;
		g_lastLocalPercent = 0;
		g_localPosition = g_rangeLow;
		return isU ? CallWindowProcW(g_PBOrgProc, hwnd, PBM_SETRANGE32, 0, 300)
			: CallWindowProcA(g_PBOrgProc, hwnd, PBM_SETRANGE32, 0, 300);
	case PBM_SETPOS:
		{
			g_localPosition = (int)wp;
			const int localPercent = LocalPercent(g_localPosition);
			if (g_lastLocalPercent >= 90 && localPercent <= 10)
				BeginNextStage();
			g_lastLocalPercent = localPercent;
			wp = (WPARAM)OverallPosition(localPercent);

			HWND hwndNSIS=GetParent(GetParent(hwnd));
			UINT cchTot,cch=SNDMSG(hwndNSIS,WM_GETTEXTLENGTH,0,0);
			cchTot=cch+5+1;
			void*buf=NSISMemAlloc(cchTot*(isU?2:1));
			if (buf) 
			{
				const UINT percent=(UINT)(wp*100/(g_rangeTot?g_rangeTot:300));
				
				if (isU)
					FixTitleAorW(WCHAR,W,percent);
				else
					FixTitleAorW(char,A,percent);

				NSISMemFree(buf);
			}
		}
		return isU ? CallWindowProcW(g_PBOrgProc, hwnd, msg, wp, lp)
			: CallWindowProcA(g_PBOrgProc, hwnd, msg, wp, lp);
	case PBM_DELTAPOS:
		{
			g_localPosition += (int)wp;
			const int localPercent = LocalPercent(g_localPosition);
			if (g_lastLocalPercent >= 90 && localPercent <= 10)
				BeginNextStage();
			g_lastLocalPercent = localPercent;
			return isU ? CallWindowProcW(g_PBOrgProc, hwnd, PBM_SETPOS, OverallPosition(localPercent), 0)
				: CallWindowProcA(g_PBOrgProc, hwnd, PBM_SETPOS, OverallPosition(localPercent), 0);
		}
	}
	return isU ? CallWindowProcW(g_PBOrgProc,hwnd,msg,wp,lp) : CallWindowProcA(g_PBOrgProc,hwnd,msg,wp,lp);
}

UINT_PTR __cdecl NSISPluginCallback(/*UINT Event*/) 
{
/*	switch(Event) 
	{
	case NSPIM_UNLOAD:
		break;
	}
*/	return NULL;
}

extern "C" void __declspec(dllexport) __cdecl Start(HWND hwndNSIS,int N_CCH,char*N_Vars,LPVOID ppST,extra_parameters*pXP) 
{
	const BOOL isU=IsWindowUnicode(hwndNSIS);
	pXP->RegisterPluginCallback(g_hThisDll,NSISPluginCallback);
	
	HWND hProgress=FindWindowExA(FindWindowExA(hwndNSIS,NULL,"#32770",NULL),NULL,"msctls_progress32",NULL);
	if (hProgress)
	{
		PBRANGE pbr;
		SendMessage(hProgress,PBM_GETRANGE,0,(LPARAM)&pbr);
		g_rangeLow=pbr.iLow;
		g_rangeHigh=pbr.iHigh;
		g_rangeTot=300;
		g_lastLocalPercent=0;
		g_localPosition=pbr.iLow;
		g_stage=0;

		// Initialize the display scale before intercepting NSIS range updates.
		SendMessage(hProgress, PBM_SETRANGE32, 0, 300);
		g_PBOrgProc=(WNDPROC) (isU?SetWindowLongPtrW:SetWindowLongPtrA) (hProgress,GWLP_WNDPROC,(LONG_PTR)PBSubProc);
	}
}

extern "C" BOOL WINAPI _DllMainCRTStartup(HMODULE hInst,UINT Reason,LPVOID lpReserved)
{
	g_hThisDll=hInst;
	return TRUE;
}
