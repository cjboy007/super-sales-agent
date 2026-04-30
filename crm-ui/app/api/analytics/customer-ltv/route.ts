import { NextResponse } from 'next/server';
import { getCustomerLTV } from '../../../../lib/analytics/order-data-service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || '20')));

    return NextResponse.json({
      success: true,
      data: getCustomerLTV(limit),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: error?.message || '获取客户 LTV 失败',
      },
      { status: 500 }
    );
  }
}
