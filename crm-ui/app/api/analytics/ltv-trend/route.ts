import { NextResponse } from 'next/server';
import { getLTVTrend } from '../../../../lib/analytics/order-data-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(36, Number(searchParams.get('limit') || '12')));

    return NextResponse.json({
      success: true,
      data: getLTVTrend(limit),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: error?.message || '获取 LTV 趋势失败',
      },
      { status: 500 }
    );
  }
}
