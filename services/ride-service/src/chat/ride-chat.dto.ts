import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendRideChatDto {
  @ApiProperty({ example: 'Je suis devant la porte bleue' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}
