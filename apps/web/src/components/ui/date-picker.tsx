import { useState } from 'react';
import IconCalendar from '@/components/icons/Calendar.Icon.js';
import { formatDate } from '@/lib/helpers/formatDate.helper.js';
import { Button } from './button.js';
import { Calendar } from './calendar.js';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';

const DatePicker = () => {
  const [date, setDate] = useState<Date>();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={date ? undefined : 'primary'} className="justify-start font-normal md:w-full md:min-w-[220px]">
          <IconCalendar className="mr-4 size-4" />
          {date ? <p className="font-mono">{formatDate(date)}</p> : <span>Escolha o dia</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={setDate} />
      </PopoverContent>
    </Popover>
  );
};

export default DatePicker;
