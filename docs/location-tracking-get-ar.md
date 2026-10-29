# جلب بيانات التتبع — دليل الفرونت إند

هذا الدليل لجلب البيانات فقط، سواء لموظف واحد أو لكل المشروع.
الطلبات تعمل عبر Socket.IO، والنتيجة تصل داخل `emitWithAck`.

## ١. الاتصال مرة واحدة

```ts
import { io } from "socket.io-client";

const socket = io("https://ce-api.joe-mi.com/location", {
  auth: { token: accessToken, lang: "ar" },
  autoConnect: false,
  reconnection: true,
});

socket.on("connect", () => {
  console.log("تم الاتصال، يمكن طلب البيانات الآن");
});

socket.on("connect_error", (error) => {
  console.error(error.message);
  // عند Unauthorized: جدّد التوكن أو سجّل الدخول مجددًا.
});

socket.connect();
```

استخدم توكن المستخدم الحالي، ولا تضف `/api/v1` إلى عنوان السوكيت.
نفّذ الأمثلة التالية بعد الاتصال. لا تنشئ اتصالًا جديدًا مع كل طلب أو صفحة.

## ٢. دالة مشتركة للطلب

```ts
type TrackingQuery = {
  userId?: string;
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
};

async function getTracking(
  event: "tracking:user:get" | "tracking:project:get",
  query: TrackingQuery = {},
) {
  if (!socket.connected) throw new Error("السوكيت غير متصل");

  const response = await socket.timeout(10_000).emitWithAck(event, query);
  if (!response?.data?.success) {
    throw new Error(response?.data?.message || "تعذر جلب البيانات");
  }
  return response.data;
}
```

استدعِ الدالة داخل `try/catch` لمعالجة رفض الصلاحية أو انقطاع الاتصال أو انتهاء المهلة.
لا تحتاج إلى `socket.on("tracking:project:result")`؛ النتيجة ترجع من الدالة مباشرة.

## ٣. كل بيانات المشروع

```ts
try {
  const data = await getTracking("tracking:project:get", {
    page: 1,
    limit: 50,
    fromDate: "2026-10-29",
    toDate: "2026-10-29",
  });

  console.log(data.items);      // نقاط التتبع في هذه الصفحة
  console.log(data.total);      // إجمالي النقاط المطابقة
  console.log(data.totalPages); // عدد الصفحات
} catch (error) {
  console.error(error);
}
```

لا ترسل `projectId`؛ الباك إند يحدد المشروع من المستخدم المتصل.
الصلاحية المطلوبة: `LOCATION_TRACKING_READ_PROJECT`، وقد تم منحها لدور مدير المشروع `admin`.

## ٤. بيانات موظف واحد

```ts
const data = await getTracking("tracking:user:get", {
  userId: "EMPLOYEE_UUID",
  page: 1,
  limit: 50,
  fromDate: "2026-10-29",
  toDate: "2026-10-29",
});
```

احذف `userId` لجلب بيانات المستخدم الحالي. بياناتك لا تحتاج صلاحية قراءة موظف آخر.
لجلب موظف آخر تحتاج `LOCATION_TRACKING_READ_USER`، ويجب أن يكون الموظف في نفس المشروع.
صلاحية قراءة المشروع وحدها لا تمنح صلاحية هذا الطلب لموظف آخر.

## ٥. شكل النتيجة

مثال توضيحي لطلب المشروع؛ الأسماء والمعرّفات للتوضيح:

```json
{
  "event": "tracking:project:result",
  "data": {
    "success": true,
    "items": [
      {
        "id": "tracking-uuid",
        "userId": "employee-uuid",
        "employeeName": "أحمد محمد",
        "username": "AEC-123",
        "projectId": "project-uuid",
        "branchId": "branch-uuid",
        "branchName": "فرع الرياض",
        "journeyId": "journey-uuid",
        "checkInId": "checkin-uuid",
        "journey": {
          "id": "journey-uuid",
          "date": "2026-10-29",
          "type": "planned",
          "status": "present",
          "branchId": "branch-uuid"
        },
        "lat": 24.7136,
        "lng": 46.6753,
        "isOutside": false,
        "offlineSince": null,
        "recordedAt": "2026-10-29T17:20:00.000+03:00",
        "createdAt": "2026-10-29T17:20:01.000+03:00"
      }
    ],
    "total": 120,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

| الحقل | معناه |
| --- | --- |
| `employeeName` / `username` | اسم الموظف واسم الدخول من ملفه الحالي |
| `branchName` / `branchId` | الفرع المرتبط بالرحلة المسجلة مع النقطة |
| `journey` | الرحلة المرتبطة بالنقطة: المعرّف، اليوم، النوع والحالة |
| `lat` / `lng` | خط العرض والطول كأرقام |
| `isOutside` | `true` إذا كانت النقطة خارج نطاق الفرع |
| `recordedAt` | وقت التقاط الموقع بتوقيت السعودية `+03:00` |
| `createdAt` | وقت حفظ النقطة في الباك إند بتوقيت السعودية |
| `offlineSince` | بداية فجوة انقطاع اكتشفها الباك إند، أو `null` |

إذا لم توجد بيانات الفرع أو الرحلة أو الموظف المرتبط، قد ترجع الحقول المقابلة `null`.
الفرع يُؤخذ من الرحلة المحفوظة أو رحلة تسجيل الحضور، وليس من فرع الموظف الحالي.

طلب الموظف يرجع `event: "tracking:user:result"` ونفس حقول الصفحات، ويضيف:

```json
{
  "events": [],
  "eventsTotal": 0,
  "eventsTotalPages": 0
}
```

`events` أحداث التتبع المسجلة، مثل الخروج من نطاق الفرع والعودة إليه.
لها عدد مستقل عن النقاط، وتستخدم نفس `page` و`limit` والتواريخ.
عند عرض القائمتين، استمر حتى أكبر قيمة بين `totalPages` و`eventsTotalPages`.

## ٦. الاستخدام الأسرع

- ابدأ ببيانات اليوم، و`page: 1` و`limit: 50`. الحد الأقصى للصفحة 100 نقطة.
- اطلب الصفحة التالية عند التمرير أو الضغط على التالي؛ لا تحمّل كل الصفحات عند فتح الشاشة.
- غيّر `page` إلى 1 عند تغيير الموظف أو التاريخ، واستبدل النتائج القديمة.
- امنع الطلب المكرر أثناء التحميل. عند إضافة صفحة، امنع تكرار النقاط باستخدام `id`.
- النتيجة تحتوي نقاطًا، وليست قائمة موظفين فريدة؛ قد يتكرر نفس الموظف في أكثر من نقطة.
- هذه طلبات قراءة مرة واحدة؛ البيانات لا تتحدث تلقائيًا. استخدم زر تحديث عند الحاجة.
- الترتيب من الأحدث للأقدم. وصول نقاط جديدة قد يغيّر توزيع النتائج بين الصفحات.
- التواريخ بصيغة `YYYY-MM-DD` وبتوقيت السعودية. يمكن إرسال بداية فقط أو نهاية فقط، أو حذفهما لجلب كل التاريخ.
- لا تضف ثلاث ساعات بنفسك إلى التوقيت. لعرضه بالسعودية استخدم `timeZone: "Asia/Riyadh"`.
- بعد تعديل الصلاحيات، أعد الاتصال بالسوكيت لتحميل الصلاحيات الجديدة.

عند رفض الطلب، يصل الرد مثل:

```json
{
  "event": "tracking:project:result",
  "data": {
    "success": false,
    "message": "You cannot view project tracking history"
  }
}
```

ملاحظة للبيانات القديمة: النقاط المحفوظة بدون `projectId` لا تظهر في طلب المشروع.
