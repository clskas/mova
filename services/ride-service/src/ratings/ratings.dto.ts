import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
export class CreateRatingDto {
  @ApiProperty() @IsUUID() rideId: string;
  @ApiProperty() @IsUUID() toUserId: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) score: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() comment?: string;
}
